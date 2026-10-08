import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FileJson2, LoaderCircle, MapPinned, Upload } from "lucide-react";
import {
  useImportParcellesGeoJson,
  usePreviewParcellesGeoJsonImport,
} from "@workspace/api-client-react";
import type {
  GeoJsonImportPreview,
  GeoJsonImportResult,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const statusLabels: Record<string, string> = {
  importable: "Prêt à importer",
  already_has_polygon: "Contour déjà présent",
  not_matched: "Aucune parcelle correspondante",
  duplicate_in_file: "Code répété dans le fichier",
  duplicate_database: "Code déjà utilisé",
  missing_code: "Code manquant",
  invalid_geometry: "Géométrie invalide",
  inactive_parcel: "Parcelle inactive",
};

const summaryItems = [
  { key: "importable", label: "Importables", tone: "ready" },
  { key: "alreadyHasPolygon", label: "Contour déjà présent", tone: "held" },
  { key: "notMatched", label: "Sans correspondance", tone: "held" },
  { key: "duplicateInFile", label: "Doublons fichier", tone: "held" },
  { key: "duplicateInDatabase", label: "Doublons base", tone: "held" },
  { key: "missingCode", label: "Sans code", tone: "held" },
  { key: "invalidGeometry", label: "Géométrie invalide", tone: "held" },
  { key: "inactiveParcel", label: "Parcelle inactive", tone: "held" },
] as const;

function formatSurface(value: number | null) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ha`;
}

function extractError(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

export function GeoJsonImportDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GeoJsonImportPreview | null>(null);
  const [selectedField, setSelectedField] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const previewMutation = usePreviewParcellesGeoJsonImport();
  const importMutation = useImportParcellesGeoJson();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function reset() {
    setFile(null);
    setPreview(null);
    setSelectedField("");
    previewMutation.reset();
    importMutation.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  async function loadPreview(nextFile: File, field?: string, keepPreviousPreview = false) {
    setFile(nextFile);
    if (!keepPreviousPreview) setPreview(null);
    setSelectedField(field ?? "");
    previewMutation.reset();
    try {
      const result = await previewMutation.mutateAsync({
        data: {
          fichier: nextFile,
          ...(field ? { champCode: field } : {}),
        },
      });
      setPreview(result);
      setSelectedField(result.selectedField);
    } catch {
      // L’erreur est présentée dans le dialogue afin de garder le contexte du fichier.
    }
  }

  function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.size > 30 * 1024 * 1024) {
      setFile(null);
      setPreview(null);
      toast({
        title: "Fichier trop volumineux",
        description: "La taille maximale acceptée est de 30 Mo.",
        variant: "warning",
      });
      return;
    }
    const validExtension = /\.(geojson|json)$/i.test(nextFile.name);
    if (!validExtension) {
      setFile(null);
      setPreview(null);
      toast({
        title: "Format de fichier non pris en charge",
        description: "Choisissez un fichier .geojson ou .json.",
        variant: "warning",
      });
      return;
    }
    void loadPreview(nextFile);
  }

  async function handleFieldChange(field: string) {
    setSelectedField(field);
    if (file) await loadPreview(file, field, true);
  }

  async function confirmImport() {
    if (!file || !preview || preview.summary.importable < 1 || selectedField !== preview.selectedField) return;
    try {
      const result: GeoJsonImportResult = await importMutation.mutateAsync({
        data: { fichier: file, champCode: selectedField },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["parcelles-carte"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-carte-globale"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-conformite"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-conformite-globale"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-liste"] }),
      ]);
      toast({
        title: `${result.imported} contour${result.imported > 1 ? "s" : ""} importé${result.imported > 1 ? "s" : ""}`,
        description: result.message,
        variant: result.imported > 0 ? "success" : "warning",
        duration: 9000,
      });
      close();
    } catch (error) {
      toast({
        title: "Import impossible",
        description: extractError(error),
        variant: "destructive",
        duration: 7000,
      });
    }
  }

  const error = previewMutation.error;
  const busy = previewMutation.isPending || importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto border-[#dce4da] bg-[#fbfcf8] p-0 text-[#203329] shadow-[0_24px_80px_rgba(22,49,34,.22)] sm:rounded-xl">
        <div className="border-b border-[#e4e9e1] bg-[#f4f7f1] px-5 py-5 sm:px-7">
          <DialogHeader className="pr-8 text-left">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#58715d]">
              <span className="h-px w-5 bg-[#bf9635]" />
              Parcelles · Import cartographique
            </div>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[#1a4731]">
              <MapPinned size={21} />
              Importer des contours GeoJSON
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-relaxed text-[#66756a]">
              Associez chaque contour à une parcelle à partir d’un champ de code. L’aperçu identifie les lignes importables ; les contours déjà enregistrés restent inchangés.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {!preview && (
            <div>
              <label
                htmlFor="geojson-file"
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  handleFile(event.dataTransfer.files[0]);
                }}
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 text-center transition-colors focus-within:ring-2 focus-within:ring-[#1a4731] ${
                  isDragging ? "border-[#1a4731] bg-[#eaf1e9]" : "border-[#b9c8b9] bg-white hover:border-[#64836b] hover:bg-[#f7faf5]"
                }`}
              >
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#eaf1e8] text-[#1a5739]">
                  {previewMutation.isPending ? <LoaderCircle className="animate-spin" size={21} /> : <Upload size={21} />}
                </span>
                <span className="text-sm font-bold text-[#263b2d]">
                  {previewMutation.isPending ? "Analyse du fichier en cours…" : "Déposez votre fichier ici ou choisissez-le"}
                </span>
                <span className="mt-1 text-xs text-[#718075]">Formats acceptés : .geojson, .json</span>
                <input
                  ref={inputRef}
                  id="geojson-file"
                  type="file"
                  accept=".geojson,.json,application/geo+json,application/json"
                  className="sr-only"
                  aria-label="Choisir un fichier GeoJSON ou JSON"
                  data-testid="input-geojson-file"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {preview && (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-[#e2e8df] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf3eb] text-[#1a5739]"><FileJson2 size={19} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#263b2d]" data-testid="text-geojson-filename">{preview.fileName}</p>
                    <p className="text-xs text-[#718075]">{preview.summary.totalFeatures} entités dans le fichier</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="geojson-code-field" className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7b6f]">Champ utilisé pour la correspondance</label>
                    <select
                      id="geojson-code-field"
                      value={selectedField}
                      onChange={(event) => void handleFieldChange(event.target.value)}
                      disabled={busy}
                      className="h-9 min-w-44 rounded-md border border-[#ccd7cb] bg-[#fcfdfa] px-3 text-sm text-[#263b2d] outline-none focus:border-[#1a5739] focus:ring-2 focus:ring-[#1a5739]/15"
                      data-testid="select-geojson-code-field"
                    >
                      {preview.codeFields.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={reset} className="h-9 rounded-md border border-[#d5ded2] px-3 text-xs font-bold text-[#47604c] hover:bg-[#f3f7f1]" data-testid="button-change-geojson-file">
                    Changer de fichier
                  </button>
                </div>
              </div>

              {previewMutation.isPending && (
                <div className="flex items-center gap-3 rounded-md border border-[#dce6d9] bg-[#f4f8f2] px-4 py-3 text-sm text-[#4f6753]" role="status">
                  <LoaderCircle size={17} className="animate-spin" /> Actualisation de l’aperçu avec le nouveau champ…
                </div>
              )}

              <section aria-labelledby="import-summary-heading">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <h3 id="import-summary-heading" className="text-sm font-extrabold text-[#263b2d]">Résultat de la correspondance</h3>
                    <p className="mt-0.5 text-xs text-[#718075]">Le détail de chaque entité est visible ci-dessous.</p>
                  </div>
                  <p className="shrink-0 font-mono text-xs text-[#607166]">{preview.summary.codesFound} codes reconnus</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {summaryItems.map(({ key, label, tone }) => (
                    <div key={key} className={`rounded-md border px-3 py-2.5 ${tone === "ready" ? "border-[#c7ddc6] bg-[#edf6eb]" : "border-[#e4e9e2] bg-[#f7f8f5]"}`}>
                      <p className="font-mono text-lg font-bold leading-none text-[#244c32]" data-testid={`metric-geojson-${key}`}>{preview.summary[key]}</p>
                      <p className="mt-1.5 text-[10px] font-semibold leading-tight text-[#68776b]">{label}</p>
                    </div>
                  ))}
                </div>
                {preview.summary.identicalDuplicates > 0 && (
                  <p className="mt-2 text-xs text-[#737c68]">{preview.summary.identicalDuplicates} doublon(s) identique(s) regroupé(s).</p>
                )}
              </section>

              <section aria-label="Détail des entités GeoJSON">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-[#263b2d]">Détail des entités</h3>
                  <span className="text-xs text-[#718075]">{preview.rows.length} ligne(s)</span>
                </div>
                <div className="max-h-[310px] overflow-auto rounded-lg border border-[#e1e7df] bg-white">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f2f5ef] text-[10px] uppercase tracking-[.08em] text-[#69776b]">
                      <tr>
                        <th scope="col" className="px-3 py-2.5 font-bold">Entité</th>
                        <th scope="col" className="px-3 py-2.5 font-bold">Code ({preview.selectedField})</th>
                        <th scope="col" className="px-3 py-2.5 font-bold">Membre</th>
                        <th scope="col" className="px-3 py-2.5 font-bold">État</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-bold">Surface</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, index) => (
                        <tr key={`${row.featureIndex}-${index}`} className="border-t border-[#edf0eb]">
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[#67766a]">{row.featureIndex}{row.featureCount > 1 ? ` · ${row.featureCount} contours` : ""}</td>
                          <td className="max-w-36 truncate px-3 py-2.5 font-mono font-medium text-[#344b3a]" title={row.code ?? undefined}>{row.code ?? "—"}</td>
                          <td className="max-w-44 truncate px-3 py-2.5 text-[#4f5f53]" title={row.memberName ?? undefined}>{row.memberName ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${row.status === "importable" ? "bg-[#e6f2e4] text-[#24623a]" : "bg-[#f1f2ed] text-[#6d746b]"}`}>
                              {row.status === "importable" && <Check size={12} />}
                              {statusLabels[row.status] ?? row.status}
                            </span>
                            {row.detail && <p className="mt-1 max-w-64 text-[10px] leading-snug text-[#7a857b]">{row.detail}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[#526357]">{formatSurface(row.superficieHa)}</td>
                        </tr>
                      ))}
                      {preview.rows.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#718075]">Aucune entité à afficher dans cet aperçu.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex items-start gap-2 rounded-md border border-[#eadfbd] bg-[#fbf7e9] px-3 py-2.5 text-xs leading-relaxed text-[#6d5c31]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>Seuls les contours marqués « Prêt à importer » seront ajoutés. Un contour déjà présent ne sera jamais remplacé. Après l’import, relancez la vérification EUDR lorsque nécessaire.</p>
              </div>
            </>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-[#efd0c7] bg-[#fff4ef] px-3 py-2.5 text-sm text-[#8d4031]" data-testid="status-preview-error">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Aperçu impossible</p>
                <p className="mt-0.5 break-words text-xs">{extractError(error)}</p>
              </div>
              {file && <button type="button" className="text-xs font-bold underline" onClick={() => void loadPreview(file, selectedField || undefined, Boolean(preview))}>Réessayer</button>}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e4e9e1] bg-[#f8faf6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button type="button" onClick={close} className="min-h-10 rounded-md px-3 text-sm font-semibold text-[#647267] hover:bg-[#edf1eb]" data-testid="button-cancel-geojson-import">
            Annuler
          </button>
          <Button
            onClick={() => void confirmImport()}
            disabled={!preview || previewMutation.isPending || importMutation.isPending || preview.summary.importable < 1 || selectedField !== preview.selectedField}
            className="min-h-10 bg-[#1a4731] text-white hover:bg-[#123b28] sm:min-w-56"
            data-testid="button-confirm-geojson-import"
          >
            {importMutation.isPending ? <><LoaderCircle className="animate-spin" size={16} /> Import en cours…</> : <>Importer {preview?.summary.importable ?? 0} contour{preview?.summary.importable === 1 ? "" : "s"} éligible{preview?.summary.importable === 1 ? "" : "s"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GeoJsonImportDialog;
