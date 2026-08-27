import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Package, Search, Loader2, ChevronRight, Calendar,
  Scale, Banknote, TrendingDown, ArrowDownCircle, FileDown,
  Warehouse, ChevronDown, MapPin, User, Printer, ClipboardList,
  ArrowRight, CheckCircle2, AlertCircle,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const ROLES_VOIR_DELEGUES = ["pca", "directeur", "magasinier", "comptable", "auditeur"];
const ROLES_VOIR_SESSIONS = ["pca", "directeur", "magasinier", "comptable", "caissier", "auditeur"];

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
const apiPut = (url: string, body: unknown) =>
  fetch(`${BASE}${url}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionPesee {
  id: number;
  numeroSession: string;
  numeroPesee?: number | null;
  membreId: number | null;
  membreNom: string | null;
  membrePrenoms: string | null;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  fournisseurPrenoms: string | null;
  produit: string;
  statut: "en_cours" | "terminee" | "annulee";
  poidsTotalKg: string;
  nbSacsTotal: number;
  dateFin: string | null;
  dateDebut: string;
  livraisonId: number | null;
}

interface EntrepotDelegue {
  id: number;
  nom: string;
  zoneNom: string | null;
  zoneType: string | null;
  stockActuelKg: string | null;
  capaciteMaxKg: string | null;
  seuilAlerteKg: string | null;
  actif: boolean;
  delegueNom: string | null;
  deleguePrenoms: string | null;
}

interface Livraison {
  id: number;
  numeroPesee?: number | null;
  membreId: number | null;
  fournisseurId: number | null;
  membreNom: string | null;
  membrePrenoms: string | null;
  fournisseurNom: string | null;
  fournisseurPrenoms: string | null;
  poidsKg: string;
  prixUnitaireFcfa: number | null;
  montantBrutFcfa: number | null;
  avanceDeduiteFcfa: number | null;
  intrantsDeduitsFcfa: number | null;
  montantNetFcfa: number | null;
  statutPaiement: string | null;
  montantRestant: string | number | null;
  dateLivraison: string;
  createdAt: string;
  agentNom: string | null;
  agentPrenoms: string | null;
  agentRole: string | null;
  /** Personne qui a physiquement saisi (proxy délégué central) — présent seulement si différent de l'agent */
  peseurNom: string | null;
  peseurPrenoms: string | null;
  /** Plan de déduction d'avance : null = aucune avance, "integral", "partiel", "reporte" */
  planAvanceType?: string | null;
  nombreSacs?: number | null;
}

const ROLE_SAISIE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  peseur:        { label: "Peseur",        color: "#0369a1", bg: "#e0f2fe" },
  delegue:       { label: "Délégué",       color: "#15803d", bg: "#dcfce7" },
  agent_terrain: { label: "Agent terrain", color: "#065f46", bg: "#d1fae5" },
  magasinier:    { label: "Magasinier",    color: "#c2410c", bg: "#ffedd5" },
  directeur:     { label: "Directeur",     color: "#1a4731", bg: "#f0fdf4" },
  pca:           { label: "PCA",           color: "#4c1d95", bg: "#ede9fe" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(Number(n)) + " FCFA";
}

function fmtPoids(v: string | null | undefined) {
  if (!v) return "—";
  return parseFloat(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " kg";
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function statutPaiementLabel(statut: string | null | undefined) {
  const normalise = (statut ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  if (normalise === "PAYE") return { label: "Payé", cls: "bg-green-100 text-green-700" };
  if (normalise === "PARTIEL") return { label: "Partiellement payé", cls: "bg-blue-100 text-blue-700" };
  return { label: "En attente", cls: "bg-amber-100 text-amber-700" };
}

// ─── SessionsPeseeSection ─────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  wave: "Wave",
  cheque: "Chèque",
};

const ROLES_CONVERTIR_SESSION = ["pca", "directeur"];

function SessionsPeseeSection() {
  const { utilisateur } = useAuth();
  const peutConvertir = ROLES_CONVERTIR_SESSION.includes(utilisateur?.role ?? "");
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(true);
  const [converting, setConverting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeChoisi, setModeChoisi] = useState<Record<number, string>>({});

  const { data: sessions = [], isLoading } = useQuery<SessionPesee[]>({
    queryKey: ["sessions-pesee-terminées"],
    queryFn: () => apiFetch("/api/pesee/sessions?statut=terminee&limit=30"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  async function convertir(session: SessionPesee) {
    const modePaiement = (modeChoisi[session.id] ?? "especes") as
      "especes" | "orange_money" | "mtn_momo" | "wave" | "cheque";
    setConverting(session.id);
    setError(null);
    try {
      const res = await apiPut(`/api/pesee/sessions/${session.id}/livraison`, { modePaiement });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { erreur?: string };
        setError(body?.erreur ?? "Erreur lors de la conversion");
      } else {
        await qc.invalidateQueries({ queryKey: ["sessions-pesee-terminées"] });
        await qc.invalidateQueries({ queryKey: ["livraisons-liste"] });
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setConverting(null);
    }
  }

  const aConvertir = sessions.filter((s) => !s.livraisonId);
  const converties = sessions.filter((s) => s.livraisonId);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <ClipboardList size={14} className="text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-gray-800">Sessions de pesée terminées</span>
          {aConvertir.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
              {aConvertir.length} à convertir
            </span>
          )}
        </div>
        <ChevronDown size={15} className={`text-gray-400 transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="px-4 py-6 flex justify-center">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Aucune session terminée pour le moment.
            </div>
          ) : (
            <>
              {error && (
                <div className="mx-4 mt-3 flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle size={12} /> {error}
                </div>
              )}
              {/* Sessions à convertir */}
              {aConvertir.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {aConvertir.map((s) => {
                    const poids = parseFloat(s.poidsTotalKg ?? "0");
                    const mode = modeChoisi[s.id] ?? "especes";
                    return (
                      <div key={s.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <ClipboardList size={13} className="text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {s.membrePrenoms ?? s.fournisseurPrenoms ?? ""} {s.membreNom ?? s.fournisseurNom ?? "—"}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Scale size={10} /> {poids.toFixed(2)} kg · {s.nbSacsTotal} sac{s.nbSacsTotal !== 1 ? "s" : ""}
                              </span>
                              {s.dateFin && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Calendar size={10} /> {fmtDate(s.dateFin)}
                                </span>
                              )}
                              <span className="text-xs text-blue-500 font-mono">{s.numeroSession}</span>
                            </div>
                          </div>
                        </div>
                        {peutConvertir && (
                          <div className="flex items-center gap-2 pl-11">
                            <select
                              value={mode}
                              onChange={(e) => setModeChoisi((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
                            >
                              {Object.entries(MODE_LABELS).map(([v, label]) => (
                                <option key={v} value={v}>{label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => convertir(s)}
                              disabled={converting === s.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition"
                              style={{ backgroundColor: "#1a4731" }}
                            >
                              {converting === s.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <><ArrowRight size={11} /> Créer livraison</>
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Sessions déjà converties */}
              {converties.length > 0 && (
                <div className={`divide-y divide-gray-50 ${aConvertir.length > 0 ? "border-t border-gray-100" : ""}`}>
                  {converties.map((s) => {
                    const poids = parseFloat(s.poidsTotalKg ?? "0");
                    return (
                      <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 size={13} className="text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {s.membrePrenoms ?? s.fournisseurPrenoms ?? ""} {s.membreNom ?? s.fournisseurNom ?? "—"}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Scale size={10} /> {poids.toFixed(2)} kg
                            </span>
                            <span className="text-xs text-blue-500 font-mono">{s.numeroSession}</span>
                          </div>
                        </div>
                        <Link href={`/livraisons`}>
                          <a className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-200 transition flex-shrink-0">
                            Livraison #{s.numeroPesee ?? s.livraisonId} <ChevronRight size={10} />
                          </a>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LivraisonsPage() {
  const { utilisateur } = useAuth();
  const voitDelegues = ROLES_VOIR_DELEGUES.includes(utilisateur?.role ?? "");
  const voitSessions = ROLES_VOIR_SESSIONS.includes(utilisateur?.role ?? "");
  const [recherche, setRecherche] = useState("");
  const [deleguesOuvert, setDeleguesOuvert] = useState(true);
  const [filtreRole, setFiltreRole] = useState<"" | "peseur" | "delegue" | "agent_terrain">("");

  const { data: livraisons = [], isLoading } = useQuery<Livraison[]>({
    queryKey: ["livraisons-liste"],
    queryFn: () => apiFetch("/api/livraisons?limit=100"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: entrepotsDelegues = [] } = useQuery<EntrepotDelegue[]>({
    queryKey: ["entrepots-delegues-liste"],
    queryFn: () => apiFetch("/api/entrepots"),
    enabled: voitDelegues,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const filtres = livraisons.filter((l) => {
    if (filtreRole && l.agentRole !== filtreRole) return false;
    if (!recherche) return true;
    const r = recherche.toLowerCase();
    return (
      (l.membreNom ?? "").toLowerCase().includes(r) ||
      (l.membrePrenoms ?? "").toLowerCase().includes(r) ||
      (l.fournisseurNom ?? "").toLowerCase().includes(r) ||
      (l.fournisseurPrenoms ?? "").toLowerCase().includes(r)
    );
  });

  const totalPoids = livraisons.reduce((s, l) => s + parseFloat(l.poidsKg ?? "0"), 0);
  const totalNet = livraisons.reduce((s, l) => s + (l.montantNetFcfa ?? 0), 0);
  const totalRestant = livraisons.reduce((s, l) => s + Number(l.montantRestant ?? 0), 0);
  const totalPaye = Math.max(0, totalNet - totalRestant);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Livraisons</h1>
          <p className="text-gray-500 text-sm mt-0.5">Historique des pesées de cacao</p>
        </div>
      </div>

      {/* KPIs résumé */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Package size={14} className="text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Livraisons</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{livraisons.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtPoids(String(totalPoids))} total</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Banknote size={14} className="text-amber-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Montant net</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {new Intl.NumberFormat("fr-FR").format(totalNet)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">FCFA</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Banknote size={14} className="text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Reste à payer</span>
          </div>
          <p className="text-lg font-bold text-blue-700">{new Intl.NumberFormat("fr-FR").format(totalRestant)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Déjà versé : {fmt(totalPaye)}</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par nom de producteur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
        />
      </div>

      {/* Filtre agent saisie */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 font-medium flex items-center gap-1"><User size={11} /> Saisi par :</span>
        {([
          { value: "" as const,              label: "Tous" },
          { value: "peseur" as const,        label: "Peseur" },
          { value: "delegue" as const,       label: "Délégué" },
          { value: "agent_terrain" as const, label: "Agent terrain" },
        ] as const).map((opt) => {
          const style = opt.value ? ROLE_SAISIE_LABEL[opt.value] : null;
          const actif = filtreRole === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setFiltreRole(opt.value)}
              className="text-xs px-2.5 py-1 rounded-full font-medium border transition-all"
              style={actif && style
                ? { background: style.bg, color: style.color, borderColor: style.color }
                : actif
                  ? { background: "#1a4731", color: "#fff", borderColor: "#1a4731" }
                  : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
              }
            >
              {opt.label}
            </button>
          );
        })}
        {filtreRole && (
          <span className="text-xs text-gray-400 ml-1">
            — {filtres.length} livraison{filtres.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full"><tbody><TableSkeleton colonnes={4} lignes={6} /></tbody></table>
        </div>
      ) : filtres.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100">
          <EmptyState
            icone={Package}
            titre={recherche ? "Aucun résultat pour cette recherche" : "Aucune livraison enregistrée"}
            description={!recherche ? "Les livraisons pesées apparaîtront ici." : undefined}
          />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtres.map((l) => (
            <LivraisonRow key={l.id} livraison={l} />
          ))}
        </div>
      )}

      {/* ─── Sessions de pesée ───────────────────────────────────────────── */}
      {voitSessions && <SessionsPeseeSection />}

      {/* ─── Entrepôts délégués ─────────────────────────────────────────── */}
      {voitDelegues && entrepotsDelegues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setDeleguesOuvert((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <Warehouse size={14} className="text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-gray-800">
                Entrepôts délégués
              </span>
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                {entrepotsDelegues.length}
              </span>
            </div>
            <ChevronDown
              size={15}
              className={`text-gray-400 transition-transform ${deleguesOuvert ? "rotate-180" : ""}`}
            />
          </button>

          {deleguesOuvert && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {entrepotsDelegues.map((e) => {
                const stock = parseFloat(e.stockActuelKg ?? "0");
                const capacite = parseFloat(e.capaciteMaxKg ?? "0");
                const seuil = parseFloat(e.seuilAlerteKg ?? "0");
                const pct = capacite > 0 ? Math.round((stock / capacite) * 100) : 0;
                const alerteStock = seuil > 0 && stock >= seuil;
                return (
                  <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        alerteStock ? "bg-orange-100" : "bg-green-50"
                      }`}
                    >
                      <Warehouse size={14} className={alerteStock ? "text-orange-500" : "text-green-600"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.nom}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {e.zoneNom && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin size={9} /> {e.zoneNom}
                          </span>
                        )}
                        {(e.delegueNom || e.deleguePrenoms) && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <User size={9} /> {e.deleguePrenoms} {e.delegueNom}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${alerteStock ? "text-orange-600" : "text-gray-900"}`}>
                        {stock.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg
                      </p>
                      {capacite > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">{pct}% capacité</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LivraisonRow ─────────────────────────────────────────────────────────────

async function fetchRecuBlob(id: number): Promise<Blob | null> {
  const res = await fetch(`${BASE}/api/rapports/recu/livraison/${id}`, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) return null;
  return res.blob();
}

async function downloadRecuLivraison(id: number) {
  const blob = await fetchRecuBlob(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recu_livraison_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

async function printRecuLivraison(id: number) {
  const blob = await fetchRecuBlob(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("load", () => { win.print(); });
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function LivraisonRow({ livraison: l }: { livraison: Livraison }) {
  const [ouvert, setOuvert] = useState(false);
  const [downloadingRecu, setDownloadingRecu] = useState(false);
  const [printingRecu, setPrintingRecu] = useState(false);
  const poids = parseFloat(l.poidsKg ?? "0");
  const statut = statutPaiementLabel(l.statutPaiement);
  const montantRestant = Number(l.montantRestant ?? 0);

  return (
    <div>
      <button
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        onClick={() => setOuvert((v) => !v)}
      >
        {/* Avatar initiales */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: l.fournisseurId ? "#7c3aed" : "#1a4731" }}
        >
          {(l.membreNom ?? l.fournisseurNom ?? "?")[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {l.membreNom ?? l.fournisseurNom ?? "—"} {l.membrePrenoms ?? l.fournisseurPrenoms ?? ""}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar size={10} /> {fmtDate(l.dateLivraison)}
            </span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Scale size={10} /> {poids.toFixed(1)} kg
            </span>
            {l.agentRole && ROLE_SAISIE_LABEL[l.agentRole] && (
              <>
                <span className="text-xs text-gray-300">·</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{
                    background: ROLE_SAISIE_LABEL[l.agentRole]!.bg,
                    color: ROLE_SAISIE_LABEL[l.agentRole]!.color,
                  }}
                >
                  {ROLE_SAISIE_LABEL[l.agentRole]!.label}
                </span>
              </>
            )}
            {l.peseurNom && (
              <>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
                  🔄 Proxy
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">{fmt(l.montantNetFcfa)}</p>
          <p className="text-xs text-gray-500">Reste : {fmt(montantRestant)}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statut.cls}`}>
            {statut.label}
          </span>
          {l.prixUnitaireFcfa && (
            <p className="text-xs text-gray-400">{l.prixUnitaireFcfa} FCFA/kg</p>
          )}
        </div>

        <ChevronRight
          size={15}
          className={`text-gray-300 flex-shrink-0 transition-transform ${ouvert ? "rotate-90" : ""}`}
        />
      </button>

      {/* Détail dépliable */}
      {ouvert && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100 space-y-1.5">
          {(l.nombreSacs ?? 0) > 0 && (
            <DetailLine
              label="Nombre de sacs"
              value={`${l.nombreSacs} sac${(l.nombreSacs ?? 0) > 1 ? "s" : ""}`}
              icon={<Package size={11} className="text-gray-400" />}
            />
          )}
          <DetailLine label="Montant brut"   value={fmt(l.montantBrutFcfa)} />
          {l.planAvanceType === "reporte" && (
            <div className="flex items-center justify-between text-xs py-0.5">
              <span className="flex items-center gap-1 text-yellow-700 font-medium">
                <TrendingDown size={11} className="text-yellow-500" />
                Avance reportée
              </span>
              <span className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                non déduite
              </span>
            </div>
          )}
          {(l.avanceDeduiteFcfa ?? 0) > 0 && (
            <DetailLine
              label={l.planAvanceType === "partiel" ? "Avance déduite (partiel)" : "Avance déduite"}
              value={`− ${fmt(l.avanceDeduiteFcfa)}`}
              icon={<TrendingDown size={11} className="text-orange-500" />}
              valueCls="text-orange-600"
            />
          )}
          {(l.intrantsDeduitsFcfa ?? 0) > 0 && (
            <DetailLine
              label="Intrants déduits"
              value={`− ${fmt(l.intrantsDeduitsFcfa)}`}
              icon={<ArrowDownCircle size={11} className="text-blue-500" />}
              valueCls="text-blue-600"
            />
          )}
          <div className="border-t border-gray-200 pt-1.5 mt-1.5">
            <DetailLine
              label="Net à payer"
              value={fmt(l.montantNetFcfa)}
              labelCls="font-semibold text-gray-800"
              valueCls="font-bold text-green-700"
            />
            <DetailLine label="Déjà versé" value={fmt(Math.max(0, Number(l.montantNetFcfa ?? 0) - montantRestant))} valueCls="text-green-700" />
            <DetailLine label="Solde restant" value={fmt(montantRestant)} valueCls={montantRestant > 0 ? "font-bold text-blue-700" : "font-bold text-green-700"} />
            <div className="flex justify-between items-center text-xs pt-1">
              <span className="text-gray-500">Statut du règlement</span>
              <span className={`font-semibold px-2 py-0.5 rounded-full ${statut.cls}`}>{statut.label}</span>
            </div>
          </div>
          {l.agentNom && (
            <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 flex items-center gap-1">
                  <User size={11} /> {l.peseurNom ? "Délégué responsable" : "Saisi par"}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-700 font-medium">
                    {l.agentPrenoms} {l.agentNom}
                  </span>
                  {l.agentRole && ROLE_SAISIE_LABEL[l.agentRole] && (
                    <span
                      className="px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: ROLE_SAISIE_LABEL[l.agentRole]!.bg,
                        color: ROLE_SAISIE_LABEL[l.agentRole]!.color,
                      }}
                    >
                      {ROLE_SAISIE_LABEL[l.agentRole]!.label}
                    </span>
                  )}
                </span>
              </div>
              {l.peseurNom && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    <User size={11} /> Saisi physiquement par
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-700 font-medium">{l.peseurPrenoms} {l.peseurNom}</span>
                    <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
                      Base centrale
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setDownloadingRecu(true);
                await downloadRecuLivraison(l.id);
                setDownloadingRecu(false);
              }}
              disabled={downloadingRecu || printingRecu}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a4731" }}
            >
              {downloadingRecu ? <Loader2 size={12} className="animate-spin" /> : <><FileDown size={12} /> Télécharger</>}
            </button>
            <button
              onClick={async () => {
                setPrintingRecu(true);
                await printRecuLivraison(l.id);
                setPrintingRecu(false);
              }}
              disabled={downloadingRecu || printingRecu}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium disabled:opacity-50 border"
              style={{ borderColor: "#1a4731", color: "#1a4731" }}
            >
              {printingRecu ? <Loader2 size={12} className="animate-spin" /> : <><Printer size={12} /> Imprimer</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label, value, icon, labelCls = "text-gray-500", valueCls = "text-gray-800",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  labelCls?: string;
  valueCls?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={`flex items-center gap-1 ${labelCls}`}>{icon}{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}
