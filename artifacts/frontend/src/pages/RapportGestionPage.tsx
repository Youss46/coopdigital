import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText, Sparkles, Download, RotateCcw, ChevronDown,
  History, Trash2, Eye, FileType,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
function getAuthToken(): string | null {
  return localStorage.getItem("coop_token");
}

// ─── Sections disponibles ────────────────────────────────────────────────────
const SECTIONS = [
  { id: "resume",           label: "Résumé exécutif",          desc: "Synthèse des indicateurs clés (150 mots)" },
  { id: "collecte",         label: "Collecte & Production",     desc: "Tonnage, livraisons, membres actifs" },
  { id: "commercialisation",label: "Commercialisation",         desc: "Lots, ventes, CA, prix moyen" },
  { id: "finances",         label: "Situation financière",      desc: "Avances, paiements, primes" },
  { id: "membres",          label: "Gouvernance & Membres",     desc: "Effectifs, taux d'activité" },
  { id: "recommandations",  label: "Recommandations",           desc: "4 à 6 actions concrètes et priorisées" },
];

interface Campagne { id: number; anneeDebut: number; anneeFin: number; statut: string; }

interface RapportHistorique {
  id: number;
  titre: string;
  campagneId: number | null;
  sections: string[];
  createdAt: string;
  auteurNom: string | null;
  auteurPrenom: string | null;
}

interface RapportDetail extends RapportHistorique {
  contenu: string;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
  }).then(r => r.json());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function RapportGestionPage() {
  const queryClient = useQueryClient();
  const [vue, setVue] = useState<"nouveau" | "historique">("nouveau");
  const [selectedSections, setSelectedSections] = useState<string[]>(
    SECTIONS.map(s => s.id)
  );
  const [campagneId, setCampagneId] = useState<string>("");
  const [filtreCampagne, setFiltreCampagne] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [contenu, setContenu] = useState<string>("");
  const [titreCourant, setTitreCourant] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // ── Campagnes ──────────────────────────────────────────────────────────────
  const { data: campagnes = [] } = useQuery<Campagne[]>({
    queryKey: ["campagnes-rapport"],
    queryFn: () => apiFetch("/campagnes"),
  });

  // ── Historique ─────────────────────────────────────────────────────────────
  const { data: historique = [], isLoading: loadingHistorique } = useQuery<RapportHistorique[]>({
    queryKey: ["rapports-ia-historique", filtreCampagne],
    queryFn: () =>
      apiFetch(`/rapports/ia/historique${filtreCampagne ? `?campagneId=${filtreCampagne}` : ""}`),
    enabled: vue === "historique",
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/rapports/ia/historique/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { erreur?: string }).erreur ?? `Erreur ${r.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rapports-ia-historique"] });
      setConfirmDelete(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur suppression"),
  });

  // ── Rouvrir un rapport de l'historique ─────────────────────────────────────
  const handleOpenRapport = useCallback(async (id: number) => {
    setError("");
    try {
      const rapport = (await apiFetch(`/rapports/ia/historique/${id}`)) as RapportDetail & { erreur?: string };
      if (rapport.erreur) throw new Error(rapport.erreur);
      setContenu(rapport.contenu);
      setTitreCourant(rapport.titre);
      setVue("nouveau");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur ouverture rapport");
    }
  }, []);

  // ── Toggle section ─────────────────────────────────────────────────────────
  const toggleSection = useCallback((id: string) => {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }, []);

  // ── Génération streaming ───────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (selectedSections.length === 0) return;
    setGenerating(true);
    setContenu("");
    setError("");
    const campagne = campagnes.find(c => String(c.id) === campagneId);
    setTitreCourant(campagne
      ? `Rapport de gestion — Campagne ${campagne.anneeDebut}/${campagne.anneeFin}`
      : "Rapport de gestion");

    try {
      const response = await fetch(`${BASE}/api/rapports/ia/generer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sections: selectedSections,
          campagneId: campagneId ? parseInt(campagneId) : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { erreur?: string }).erreur ?? `Erreur ${response.status}`);
      }

      const reader = response.body!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text?: string; saved?: number; erreur?: string };
            if (parsed.text) setContenu(prev => prev + parsed.text);
            if (parsed.erreur) setError(parsed.erreur);
            if (parsed.saved) {
              queryClient.invalidateQueries({ queryKey: ["rapports-ia-historique"] });
            }
          } catch {
            // ignore partial JSON
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
      readerRef.current = null;
    }
  }, [selectedSections, campagneId, campagnes, queryClient]);

  // ── Télécharger PDF / Word ─────────────────────────────────────────────────
  const handleDownload = useCallback(async (format: "pdf" | "docx") => {
    if (!contenu) return;
    setDownloading(format);
    try {
      const titre = titreCourant || "Rapport de gestion";

      const response = await fetch(`${BASE}/api/rapports/ia/${format}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contenu, titre }),
      });

      if (!response.ok) throw new Error(`Erreur ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = titre.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      a.download = `${slug || "rapport_gestion"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erreur téléchargement ${format.toUpperCase()}`);
    } finally {
      setDownloading(null);
    }
  }, [contenu, titreCourant]);

  const handleReset = () => {
    setContenu("");
    setTitreCourant("");
    setError("");
  };

  const canGenerate = selectedSections.length > 0 && !generating;

  const campagneLabel = (id: number | null) => {
    if (!id) return "Toutes campagnes";
    const c = campagnes.find(x => x.id === id);
    return c ? `Campagne ${c.anneeDebut}/${c.anneeFin}` : `Campagne #${id}`;
  };

  // ── Boutons de téléchargement (réutilisés) ─────────────────────────────────
  const downloadButtons = (small: boolean) => (
    <div className="flex gap-2">
      <button
        onClick={handleReset}
        className={`flex items-center gap-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"
        }`}
      >
        <RotateCcw className={small ? "w-3 h-3" : "w-3.5 h-3.5"} /> {small ? "Nouveau" : "Nouveau rapport"}
      </button>
      <button
        onClick={() => handleDownload("docx")}
        disabled={downloading !== null}
        className={`flex items-center gap-1.5 border border-[#1a4731] text-[#1a4731] rounded-lg hover:bg-[#f0f7f3] disabled:opacity-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"
        }`}
      >
        <FileType className={small ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {downloading === "docx" ? (small ? "…" : "Génération…") : "Word"}
      </button>
      <button
        onClick={() => handleDownload("pdf")}
        disabled={downloading !== null}
        className={`flex items-center gap-1.5 bg-[#1a4731] text-white rounded-lg hover:bg-green-900 disabled:opacity-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"
        }`}
      >
        <Download className={small ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {downloading === "pdf" ? (small ? "…" : "Génération…") : "PDF"}
      </button>
    </div>
  );

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a4731] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rapport de gestion IA</h1>
            <p className="text-sm text-gray-500">Généré par Claude Sonnet · Données en temps réel</p>
          </div>
        </div>
        {vue === "nouveau" && contenu && !generating && downloadButtons(false)}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setVue("nouveau")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            vue === "nouveau"
              ? "border-[#1a4731] text-[#1a4731]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Sparkles className="w-4 h-4" /> Rapport
        </button>
        <button
          onClick={() => setVue("historique")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            vue === "historique"
              ? "border-[#1a4731] text-[#1a4731]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <History className="w-4 h-4" /> Historique
        </button>
      </div>

      {/* Erreur */}
      {error && (
        <div className="px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* ══════════ Onglet Historique ══════════ */}
      {vue === "historique" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">
              Rapports enregistrés {historique.length > 0 && `(${historique.length})`}
            </span>
            <div className="relative">
              <select
                value={filtreCampagne}
                onChange={e => setFiltreCampagne(e.target.value)}
                className="appearance-none border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white pr-7 focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
              >
                <option value="">Toutes les campagnes</option>
                {campagnes.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    Campagne {c.anneeDebut}/{c.anneeFin}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {loadingHistorique ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">Chargement…</div>
          ) : historique.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <History className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun rapport enregistré</p>
              <p className="text-xs text-gray-400 mt-1">
                Les rapports générés sont sauvegardés automatiquement.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {historique.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.titre}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {campagneLabel(r.campagneId)} · {formatDate(r.createdAt)}
                      {r.auteurNom && ` · ${r.auteurPrenom ?? ""} ${r.auteurNom}`.trimEnd()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleOpenRapport(r.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-700 hover:bg-white hover:border-[#1a4731] hover:text-[#1a4731]"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ouvrir
                    </button>
                    {confirmDelete === r.id ? (
                      <>
                        <button
                          onClick={() => deleteMutation.mutate(r.id)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? "…" : "Confirmer"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(r.id)}
                        title="Supprimer"
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ══════════ Onglet Rapport ══════════ */}
      {vue === "nouveau" && (
        <>
          {/* Panneau de configuration — masqué pendant/après génération */}
          {!contenu && !generating && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
              {/* Campagne */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Périmètre temporel
                </label>
                <div className="relative">
                  <select
                    value={campagneId}
                    onChange={e => setCampagneId(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="">Toutes les campagnes (cumul)</option>
                    {campagnes.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        Campagne {c.anneeDebut}/{c.anneeFin}{c.statut === "ouverte" ? " — en cours" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Sections */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-800">
                    Sections à inclure
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => setSelectedSections(SECTIONS.map(s => s.id))}
                      className="text-[#1a4731] hover:underline font-medium"
                    >
                      Tout sélectionner
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      onClick={() => setSelectedSections([])}
                      className="text-gray-500 hover:underline"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SECTIONS.map(section => {
                    const active = selectedSections.includes(section.id);
                    return (
                      <button
                        key={section.id}
                        onClick={() => toggleSection(section.id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          active
                            ? "border-[#1a4731] bg-[#f0f7f3]"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                          active ? "bg-[#1a4731] border-[#1a4731]" : "border-gray-300"
                        }`}>
                          {active && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${active ? "text-[#1a4731]" : "text-gray-800"}`}>
                            {section.label}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{section.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bouton générer */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full py-3 rounded-xl bg-[#1a4731] text-white font-semibold text-sm hover:bg-green-900 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Générer le rapport
              </button>
            </div>
          )}

          {/* Statut de génération */}
          {generating && (
            <div className="flex items-center gap-3 px-5 py-3 bg-[#f0f7f3] border border-[#c6dfd2] rounded-xl text-sm text-[#1a4731] font-medium">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1a4731] opacity-60" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1a4731]" />
              </span>
              Claude rédige le rapport…
            </div>
          )}

          {/* Rapport généré */}
          {(contenu || generating) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              {/* Barre d'outils */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">{titreCourant || "Rapport de gestion"}</span>
                </div>
                {contenu && !generating && downloadButtons(true)}
              </div>

              {/* Contenu markdown */}
              <div className="px-8 py-6">
                <div className="prose prose-sm prose-green max-w-none
                  prose-headings:text-[#1a4731] prose-headings:font-bold
                  prose-h2:text-lg prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2 prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-table:w-full prose-table:text-sm
                  prose-th:bg-[#f0f7f3] prose-th:text-[#1a4731] prose-th:font-semibold prose-th:px-3 prose-th:py-2
                  prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-gray-100
                  prose-strong:text-gray-900
                  prose-li:text-gray-700
                  prose-ul:space-y-1">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4">
                          <table className="w-full text-sm border-collapse rounded-lg overflow-hidden">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-[#f0f7f3]">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="text-left text-[#1a4731] font-semibold px-4 py-2.5 border border-[#c6dfd2] whitespace-nowrap">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-4 py-2 border border-gray-100 text-gray-700 align-top">
                          {children}
                        </td>
                      ),
                      tr: ({ children }) => (
                        <tr className="even:bg-gray-50 hover:bg-[#f8fcfa] transition-colors">
                          {children}
                        </tr>
                      ),
                    }}
                  >
                    {contenu}
                  </ReactMarkdown>
                </div>
                {generating && (
                  <span className="inline-block w-0.5 h-4 bg-[#1a4731] animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
