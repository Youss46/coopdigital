import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileJson2, LoaderCircle, MapPinned, Upload } from "lucide-react";
import { useImportParcellesPolygones } from "@workspace/api-client-react";
import type { PolygonesImportResult } from "@workspace/api-client-react";
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

type Step = 1 | 2 | 3;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

function Metric({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "green" | "orange" | "red" }) {
  const style = {
    neutral: "border-[#e4e9e2] bg-white text-[#263b2d]",
    green: "border-[#c7ddc6] bg-[#edf6eb] text-[#245633]",
    orange: "border-[#f0d59d] bg-[#fff7e6] text-[#9a5a00]",
    red: "border-[#efd0c7] bg-[#fff4ef] text-[#8d4031]",
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-3 ${style}`}>
      <p className="font-mono text-2xl font-bold leading-none" data-testid={`metric-polygones-${label}`}>{value}</p>
      <p className="mt-2 text-xs font-semibold leading-snug">{label}</p>
    </div>
  );
}

export function GeoJsonImportDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PolygonesImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importMutation = useImportParcellesPolygones();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const busy = importMutation.isPending;

  function reset() {
    setStep(1);
    setFile(null);
    setReport(null);
    setError(null);
    importMutation.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("La taille maximale acceptée est de 10 Mo.");
      setReport(null);
      setFile(null);
      return;
    }
    if (!/\.(geojson|json)$/i.test(nextFile.name)) {
      setError("Choisissez un fichier .geojson ou .json.");
      setReport(null);
      setFile(null);
      return;
    }

    setFile(nextFile);
    setReport(null);
    setError(null);
    setStep(2);
    importMutation.reset();
    try {
      const result = await importMutation.mutateAsync({
        data: { fichier: nextFile },
        params: { dry_run: true },
      });
      setReport(result);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function confirmImport() {
    if (!file || !report || report.mis_a_jour === 0) return;
    setError(null);
    try {
      const result = await importMutation.mutateAsync({
        data: { fichier: file },
        params: { dry_run: false },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["parcelles-carte"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-carte-globale"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-liste"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-conformite"] }),
        queryClient.invalidateQueries({ queryKey: ["parcelles-conformite-globale"] }),
      ]);
      toast({
        title: `${result.mis_a_jour} parcelle${result.mis_a_jour === 1 ? "" : "s"} mise${result.mis_a_jour === 1 ? "" : "s"} à jour`,
        description: `${result.a_verifier} contour${result.a_verifier === 1 ? "" : "s"} à vérifier.`,
        variant: "success",
        duration: 9000,
      });
      close();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  const stepNames = ["Choisir le fichier", "Vérifier le rapport", "Confirmer l’import"];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto border-[#dce4da] bg-[#fbfcf8] p-0 text-[#203329] shadow-[0_24px_80px_rgba(22,49,34,.22)] sm:rounded-xl">
        <div className="border-b border-[#e4e9e1] bg-[#f4f7f1] px-5 py-5 sm:px-7">
          <DialogHeader className="pr-8 text-left">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#58715d]">
              <span className="h-px w-5 bg-[#bf9635]" />
              Parcelles · Import cartographique
            </div>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[#1a4731]">
              <MapPinned size={21} />
              Importer les polygones
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-relaxed text-[#66756a]">
              Le code properties.code_parcelle rattache chaque contour à une parcelle de votre coopérative. L’aperçu ne modifie pas la base.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          <ol className="grid grid-cols-3 gap-2" aria-label="Étapes de l’import">
            {stepNames.map((name, index) => {
              const itemStep = (index + 1) as Step;
              const active = step === itemStep;
              const complete = step > itemStep;
              return (
                <li key={name} className={`flex items-center gap-2 rounded-md px-2 py-2 text-[11px] font-semibold sm:px-3 sm:text-xs ${
                  active ? "bg-[#1a4731] text-white" : complete ? "bg-[#e8f1e5] text-[#245633]" : "bg-[#eef1eb] text-[#718075]"
                }`} aria-current={active ? "step" : undefined}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                    active ? "bg-white/20" : complete ? "bg-[#245633] text-white" : "bg-white"
                  }`}>{complete ? <Check size={12} /> : itemStep}</span>
                  <span className="leading-tight">{name}</span>
                </li>
              );
            })}
          </ol>

          {step === 1 && (
            <div>
              <label
                htmlFor="geojson-file"
                className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9c8b9] bg-white px-5 text-center transition-colors hover:border-[#64836b] hover:bg-[#f7faf5] focus-within:ring-2 focus-within:ring-[#1a4731]"
              >
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#eaf1e8] text-[#1a5739]"><Upload size={21} /></span>
                <span className="text-sm font-bold text-[#263b2d]">Déposez le GeoJSON ou choisissez un fichier</span>
                <span className="mt-1 text-xs text-[#718075]">.geojson ou .json · maximum 10 Mo</span>
                <input
                  ref={inputRef}
                  id="geojson-file"
                  type="file"
                  accept=".geojson,.json,application/geo+json,application/json"
                  className="sr-only"
                  aria-label="Choisir un fichier GeoJSON"
                  data-testid="input-geojson-file"
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-[#e2e8df] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf3eb] text-[#1a5739]"><FileJson2 size={19} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#263b2d]" data-testid="text-polygones-filename">{file?.name}</p>
                    <p className="text-xs text-[#718075]">Contrôle à blanc · aucune écriture en base</p>
                  </div>
                </div>
                <button type="button" onClick={reset} disabled={busy} className="h-9 shrink-0 rounded-md border border-[#d5ded2] px-3 text-xs font-bold text-[#47604c] hover:bg-[#f3f7f1]" data-testid="button-change-polygons-file">
                  Changer de fichier
                </button>
              </div>

              {busy && !report && (
                <div className="flex items-center gap-3 rounded-md border border-[#dce6d9] bg-[#f4f8f2] px-4 py-3 text-sm text-[#4f6753]" role="status">
                  <LoaderCircle size={17} className="animate-spin" /> Analyse du GeoJSON en cours…
                </div>
              )}

              {report && (
                <>
                  <section aria-labelledby="polygones-import-summary">
                    <h3 id="polygones-import-summary" className="mb-2 text-sm font-extrabold text-[#263b2d]">Rapport de prévisualisation</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <Metric value={report.total} label="Entités" />
                      <Metric value={report.mis_a_jour} label="Parcelles rattachées" tone="green" />
                      <Metric value={report.non_rattaches.length} label="Codes non rattachés" tone={report.non_rattaches.length ? "orange" : "neutral"} />
                      <Metric value={report.rejetes.length} label="Entités rejetées" tone={report.rejetes.length ? "red" : "neutral"} />
                      <Metric value={report.a_verifier} label="À vérifier" tone={report.a_verifier ? "orange" : "neutral"} />
                    </div>
                  </section>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <section className="rounded-lg border border-[#e4e9e2] bg-white p-3" aria-labelledby="polygones-non-rattaches">
                      <h3 id="polygones-non-rattaches" className="text-sm font-bold text-[#263b2d]">Codes non rattachés ({report.non_rattaches.length})</h3>
                      <div className="mt-2 max-h-48 overflow-auto rounded-md bg-[#f7f8f5] p-2">
                        {report.non_rattaches.length ? (
                          <ul className="space-y-1 font-mono text-xs text-[#6b5b32]">
                            {report.non_rattaches.map((code, index) => <li key={`${code}-${index}`}>{code}</li>)}
                          </ul>
                        ) : <p className="text-xs text-[#718075]">Aucun code non rattaché.</p>}
                      </div>
                    </section>
                    <section className="rounded-lg border border-[#e4e9e2] bg-white p-3" aria-labelledby="polygones-rejetes">
                      <h3 id="polygones-rejetes" className="text-sm font-bold text-[#263b2d]">Entités rejetées ({report.rejetes.length})</h3>
                      <div className="mt-2 max-h-48 overflow-auto rounded-md bg-[#f7f8f5] p-2">
                        {report.rejetes.length ? (
                          <ul className="space-y-2 text-xs text-[#7b4035]">
                            {report.rejetes.map((item, index) => (
                              <li key={`${item.feature}-${index}`} className="border-b border-[#e6e4dd] pb-2 last:border-0">
                                <span className="font-semibold">Entité {item.feature}</span>
                                {item.code && <span className="font-mono"> · {item.code}</span>}
                                <p className="mt-0.5">{item.raison}</p>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-[#718075]">Aucune entité rejetée.</p>}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && report && (
            <section className="space-y-4" aria-labelledby="polygones-confirm-heading">
              <div className="rounded-lg border border-[#c7ddc6] bg-[#edf6eb] p-4">
                <h3 id="polygones-confirm-heading" className="flex items-center gap-2 text-sm font-extrabold text-[#245633]">
                  <CheckCircle2 size={18} /> Confirmer les modifications
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#47604c]">
                  {report.mis_a_jour} parcelle{report.mis_a_jour === 1 ? "" : "s"} de votre coopérative seront mises à jour. Seuls la géométrie, la surface du polygone, la distance GPS et le statut du polygone seront modifiés.
                </p>
                <p className="mt-2 text-xs text-[#637469]">
                  {report.non_rattaches.length} code(s) non rattaché(s) et {report.rejetes.length} entité(s) rejetée(s) seront ignorés.
                </p>
              </div>
              {report.mis_a_jour === 0 && (
                <p className="rounded-md border border-[#eadfbd] bg-[#fbf7e9] px-3 py-2 text-sm text-[#6d5c31]">
                  Aucune parcelle ne peut être mise à jour avec ce fichier.
                </p>
              )}
            </section>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-[#efd0c7] bg-[#fff4ef] px-3 py-2.5 text-sm text-[#8d4031]" data-testid="status-polygons-import-error">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{step === 2 ? "Prévisualisation impossible" : "Import impossible"}</p>
                <p className="mt-0.5 break-words text-xs">{error}</p>
              </div>
              {step === 2 && file && <button type="button" className="text-xs font-bold underline" onClick={() => void handleFile(file)}>Réessayer</button>}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e4e9e1] bg-[#f8faf6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button type="button" onClick={close} className="min-h-10 rounded-md px-3 text-sm font-semibold text-[#647267] hover:bg-[#edf1eb]" data-testid="button-cancel-polygons-import">
            Annuler
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === 3 && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(null); setStep(2); }} className="min-h-10">
                <ArrowLeft size={16} /> Retour à l’aperçu
              </Button>
            )}
            {step === 2 && report && (
              <Button type="button" disabled={busy} onClick={() => { setError(null); setStep(3); }} className="min-h-10 bg-[#1a4731] text-white hover:bg-[#123b28]" data-testid="button-continue-polygons-import">
                Continuer <ArrowRight size={16} />
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                onClick={() => void confirmImport()}
                disabled={busy || !report || report.mis_a_jour === 0}
                className="min-h-10 bg-[#1a4731] text-white hover:bg-[#123b28] sm:min-w-56"
                data-testid="button-confirm-polygons-import"
              >
                {busy ? <><LoaderCircle className="animate-spin" size={16} /> Import en cours…</> : <>Confirmer l’import</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GeoJsonImportDialog;
