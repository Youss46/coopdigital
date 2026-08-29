import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  Scale, Search, Loader2, ChevronRight,
  Package, CheckCircle2, AlertCircle, Clock, X,
  TrendingUp, AlertTriangle, Ban,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = <T,>(url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });

const apiPost = (url: string, body?: unknown) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const apiPut = (url: string, body?: unknown) =>
  fetch(`${BASE}${url}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionPesee {
  id: number;
  type: "simple" | "groupée";
  numeroSession: string;
  membreId: number | null;
  membreNom: string | null;
  membrePrenoms: string | null;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  fournisseurPrenoms: string | null;
  produit: string;
  operation: string;
  statut: "en_cours" | "terminee" | "annulee";
  poidsTotalKg: string;
  nbSacsTotal: number;
  nbLignes: number;
  dateDebut: string;
  dateFin: string | null;
  notes: string | null;
  livraisonId: number | null;
  createdAt: string;
}

interface LignePesee {
  id: number;
  sessionId: number;
  numeroPassage: number;
  nbSacs: number;
  poidsBrutKg: string;
  tareKg: string | null;
  notes: string | null;
  createdAt: string;
}

interface SessionDetail extends SessionPesee {
  lignes: LignePesee[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8h par défaut (côté client)

function isStale(dateDebut: string): boolean {
  return Date.now() - new Date(dateDebut).getTime() > STALE_THRESHOLD_MS;
}

const STATUT_CONFIG: Record<SessionPesee["statut"], { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  en_cours:  { label: "En cours",  color: "#0369a1", bg: "#e0f2fe", Icon: Clock         },
  terminee:  { label: "Terminée",  color: "#15803d", bg: "#dcfce7", Icon: CheckCircle2  },
  annulee:   { label: "Annulée",   color: "#991b1b", bg: "#fee2e2", Icon: AlertCircle   },
};

function StatutBadge({ statut }: { statut: SessionPesee["statut"] }) {
  const cfg = STATUT_CONFIG[statut];
  const Icon = cfg.Icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 99,
      fontSize: "0.75rem", fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function fmtKg(val: string | number) {
  const n = parseFloat(String(val));
  if (isNaN(n)) return "— kg";
  if (n >= 1000) return (n / 1000).toFixed(3) + " T";
  return n.toFixed(3) + " kg";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Modal détail ─────────────────────────────────────────────────────────────

function SessionDetailModal({ sessionId, onClose, canWrite }: { sessionId: number; onClose: () => void; canWrite: boolean }) {
  const qc = useQueryClient();
  const { data: detail, isLoading } = useQuery<SessionDetail>({
    queryKey: ["session-pesee-detail", sessionId],
    queryFn: () => apiFetch<SessionDetail>(`/api/pesee/sessions/${sessionId}`),
  });

  const annulerMut = useMutation({
    mutationFn: () => apiPut(`/api/pesee/sessions/${sessionId}/annuler`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessions-pesee"] });
      void qc.invalidateQueries({ queryKey: ["session-pesee-detail", sessionId] });
    },
  });

  const sessionStale = detail?.statut === "en_cours" && isStale(detail.dateDebut);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,.18)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontFamily: "monospace", marginBottom: 2 }}>
              {detail?.numeroSession ?? "…"}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
              {detail
                ? `${detail.membreNom ?? detail.fournisseurNom ?? ""} ${detail.membrePrenoms ?? detail.fournisseurPrenoms ?? ""}`.trim() || "—"
                : "Chargement…"}
            </div>
            {detail && <div style={{ marginTop: 4 }}><StatutBadge statut={detail.statut} /></div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Alerte session abandonnée */}
        {sessionStale && (
          <div style={{ margin: "12px 24px 0", padding: "10px 14px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={15} color="#92400e" />
            <span style={{ fontSize: ".8rem", color: "#92400e", fontWeight: 600 }}>
              Session en cours depuis plus de 8h — elle semble abandonnée.
            </span>
          </div>
        )}

        {isLoading && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loader2 size={28} className="animate-spin" style={{ color: "#94a3b8", margin: "0 auto" }} />
          </div>
        )}

        {detail && (
          <div style={{ padding: 24 }}>
            {/* Recap */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Poids total net", value: fmtKg(detail.poidsTotalKg), color: "#15803d" },
                { label: "Sacs", value: String(detail.nbSacsTotal) },
                { label: "Passages", value: String(detail.lignes.length) },
              ].map((kpi) => (
                <div key={kpi.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: kpi.color ?? "#0f172a" }}>{kpi.value}</div>
                  <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: 2 }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Méta */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24, fontSize: ".82rem" }}>
              <div><span style={{ color: "#94a3b8" }}>Produit · </span>{detail.produit}</div>
              <div><span style={{ color: "#94a3b8" }}>Opération · </span>{detail.operation}</div>
              <div><span style={{ color: "#94a3b8" }}>Début · </span>{fmtDate(detail.dateDebut)}</div>
              {detail.dateFin && <div><span style={{ color: "#94a3b8" }}>Fin · </span>{fmtDate(detail.dateFin)}</div>}
              {detail.livraisonId && (
                <div><span style={{ color: "#94a3b8" }}>Livraison liée · </span>#{detail.livraisonId}</div>
              )}
            </div>

            {/* Lignes */}
            {detail.lignes.length > 0 ? (
              <>
                <div style={{ fontSize: ".7rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                  Détail des passages
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".84rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: ".72rem" }}>N°</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: ".72rem" }}>Sacs</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: ".72rem" }}>Brut (kg)</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: ".72rem" }}>Tare (kg)</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: ".72rem" }}>Net (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lignes.map((l, idx) => {
                        const brut = parseFloat(l.poidsBrutKg);
                        const tare = parseFloat(l.tareKg ?? "0");
                        const net = brut - tare;
                        return (
                          <tr key={l.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#eff6ff", color: "#2563eb", fontSize: ".72rem", fontWeight: 700 }}>
                                {l.numeroPassage}
                              </span>
                            </td>
                            <td style={{ padding: "9px 12px", textAlign: "right" }}>{l.nbSacs}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right" }}>{brut.toFixed(3)}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", color: "#94a3b8" }}>{tare > 0 ? tare.toFixed(3) : "—"}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#15803d" }}>{net.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                      {/* Total row */}
                      <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                        <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 700, fontSize: ".82rem" }}>Total</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#15803d" }}>{fmtKg(detail.poidsTotalKg)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: ".85rem" }}>
                Aucun passage enregistré
              </div>
            )}

            {/* Convertir en livraison */}
            {detail.statut === "terminee" && !detail.livraisonId && (
              <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 8 }}>
                  Cette session est terminée et peut être convertie en livraison officielle.
                </div>
                {canWrite && <button
                  disabled
                  title="Disponible prochainement"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 7, border: "none",
                    background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed",
                    fontSize: ".82rem", fontWeight: 600,
                  }}
                >
                  <Package size={14} />
                  Convertir en livraison
                  <span style={{ fontSize: ".7rem", fontWeight: 400 }}>(prochainement)</span>
                </button>}
              </div>
            )}

            {/* Annuler une session en cours */}
            {detail.statut === "en_cours" && (
              <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
                <div style={{ fontSize: ".8rem", color: "#7f1d1d", marginBottom: 8 }}>
                  {sessionStale
                    ? "Cette session semble abandonnée (>8h sans clôture). Vous pouvez l'annuler pour débloquer le membre."
                    : "Annuler cette session la marquera comme abandonnée. Le membre pourra démarrer une nouvelle session."}
                </div>
                {annulerMut.isSuccess ? (
                  <p style={{ margin: 0, fontSize: ".82rem", fontWeight: 600, color: "#15803d" }}>✓ Session annulée</p>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm("Confirmer l'annulation de cette session ?")) {
                        annulerMut.mutate();
                      }
                    }}
                    disabled={annulerMut.isPending}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 7, border: "none",
                      background: annulerMut.isPending ? "#e2e8f0" : "#dc2626",
                      color: annulerMut.isPending ? "#94a3b8" : "#fff",
                      cursor: annulerMut.isPending ? "not-allowed" : "pointer",
                      fontSize: ".82rem", fontWeight: 600,
                    }}
                  >
                    <Ban size={14} />
                    {annulerMut.isPending ? "Annulation…" : "Annuler cette session"}
                  </button>
                )}
                {annulerMut.isError && (
                  <p style={{ margin: "6px 0 0", fontSize: ".78rem", color: "#dc2626" }}>Erreur lors de l'annulation.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

type StatutFilter = "all" | "en_cours" | "terminee" | "annulee";
type PeriodeFilter = "all" | "today" | "week" | "month";

function getPeriodeDates(periode: PeriodeFilter): { date_debut?: string; date_fin?: string } {
  if (periode === "all") return {};
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (periode === "today") {
    const today = fmt(now);
    return { date_debut: `${today}T00:00:00`, date_fin: `${today}T23:59:59` };
  }
  if (periode === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // lundi = 0
    const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
    return { date_debut: monday.toISOString(), date_fin: now.toISOString() };
  }
  if (periode === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { date_debut: first.toISOString(), date_fin: now.toISOString() };
  }
  return {};
}

export default function SessionsPeseePage() {
  const { isFeatureReadOnly } = useFeatureAccess("pesee");
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState<StatutFilter>("all");
  const [periode, setPeriode] = useState<PeriodeFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const qc = useQueryClient();

  const periodeDates = getPeriodeDates(periode);
  const params = new URLSearchParams({ limit: "500" });
  if (statut !== "all") params.set("statut", statut);
  if (periodeDates.date_debut) params.set("date_debut", periodeDates.date_debut);
  if (periodeDates.date_fin) params.set("date_fin", periodeDates.date_fin);

  const { data: sessions = [], isLoading } = useQuery<SessionPesee[]>({
    queryKey: ["sessions-pesee", statut, periode],
    queryFn: () => apiFetch<SessionPesee[]>(`/api/pesee/sessions?${params.toString()}`),
    refetchInterval: 30_000,
  });

  const expirerMut = useMutation({
    mutationFn: () => apiPost("/api/pesee/sessions/expirer"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sessions-pesee"] }),
  });

  // Filtrage local par recherche
  const filtered = sessions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const tiers = `${s.membreNom ?? s.fournisseurNom ?? ""} ${s.membrePrenoms ?? s.fournisseurPrenoms ?? ""}`.toLowerCase();
    return tiers.includes(q) || s.numeroSession.toLowerCase().includes(q);
  });

  // KPIs
  const nbEnCours  = sessions.filter((s) => s.statut === "en_cours").length;
  const nbTerminee = sessions.filter((s) => s.statut === "terminee").length;
  const totalKg    = sessions.filter((s) => s.statut === "terminee").reduce((acc, s) => acc + parseFloat(s.poidsTotalKg ?? "0"), 0);
  const nbStale    = sessions.filter((s) => s.statut === "en_cours" && isStale(s.dateDebut)).length;

  return (
    <div className="sessions-pesee-page" style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Scale size={22} color="#0369a1" />
            <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800 }}>Sessions de pesée</h1>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: ".88rem" }}>
            Suivi de toutes les pesées simples et groupées réalisées par les peseurs
          </p>
        </div>

        {/* Bouton expiration manuelle */}
        {nbStale > 0 && !isFeatureReadOnly && (
          <button
            onClick={() => {
              if (confirm(`Expirer les ${nbStale} session(s) abandonnée(s) depuis plus de 8h ?`)) {
                expirerMut.mutate();
              }
            }}
            disabled={expirerMut.isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: expirerMut.isPending ? "#e2e8f0" : "#b45309",
              color: expirerMut.isPending ? "#94a3b8" : "#fff",
              cursor: expirerMut.isPending ? "not-allowed" : "pointer",
              fontSize: ".82rem", fontWeight: 600,
            }}
          >
            <AlertTriangle size={14} />
            {expirerMut.isPending
              ? "Expiration…"
              : `Expirer ${nbStale} session${nbStale > 1 ? "s" : ""} abandonnée${nbStale > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "En cours", value: nbEnCours, color: "#0369a1", bg: "#e0f2fe", Icon: Clock },
          { label: "Terminées", value: nbTerminee, color: "#15803d", bg: "#dcfce7", Icon: CheckCircle2 },
          { label: "Tonnage terminé", value: fmtKg(totalKg), color: "#7c3aed", bg: "#ede9fe", Icon: TrendingUp },
          { label: "Total sessions", value: sessions.length, color: "#92400e", bg: "#fef3c7", Icon: Scale },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <kpi.Icon size={15} color={kpi.color} />
              <span style={{ fontSize: ".72rem", fontWeight: 600, color: kpi.color, textTransform: "uppercase", letterSpacing: ".04em" }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {/* Recherche */}
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: ".84rem", outline: "none", boxSizing: "border-box" }}
            placeholder="Rechercher membre ou n° session…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filtre période */}
        <div style={{ display: "flex", gap: 5, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          {(["all", "today", "week", "month"] as const).map((p) => {
            const labels: Record<PeriodeFilter, string> = { all: "Tout", today: "Aujourd'hui", week: "Semaine", month: "Mois" };
            const active = periode === p;
            return (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                style={{
                  padding: "5px 11px", borderRadius: 6, border: "none",
                  background: active ? "#fff" : "transparent",
                  color: active ? "#0f172a" : "#64748b",
                  fontSize: ".78rem", fontWeight: active ? 700 : 400, cursor: "pointer",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                  transition: "all .15s",
                }}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>

        {/* Filtre statut */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "en_cours", "terminee", "annulee"] as const).map((s) => {
            const labels: Record<StatutFilter, string> = { all: "Tous", en_cours: "En cours", terminee: "Terminées", annulee: "Annulées" };
            const active = statut === s;
            return (
              <button
                key={s}
                onClick={() => setStatut(s)}
                style={{
                  padding: "6px 12px", borderRadius: 7, border: active ? "none" : "1px solid #e2e8f0",
                  background: active ? "#0369a1" : "#fff", color: active ? "#fff" : "#374151",
                  fontSize: ".78rem", fontWeight: active ? 700 : 400, cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <Loader2 size={28} className="animate-spin" style={{ color: "#94a3b8" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
          <Scale size={36} style={{ margin: "0 auto 12px", opacity: .4 }} />
          <div style={{ fontWeight: 600, color: "#64748b" }}>Aucune session trouvée</div>
          <div style={{ fontSize: ".82rem", marginTop: 4 }}>{search ? "Affinez votre recherche" : "Les sessions de pesée groupée apparaîtront ici"}</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div
            className="sessions-pesee-table-scroll"
            role="region"
            aria-label="Liste des sessions de pesée"
            tabIndex={0}
          >
            <div className="sessions-pesee-table-content">
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 110px 90px 80px 100px 40px", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["N° Session", "Membre", "Date début", "Passages", "Sacs", "Poids net", ""].map((h) => (
                  <div key={h} style={{ fontSize: ".7rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</div>
                ))}
              </div>

              {filtered.map((s, idx) => {
                const stale = s.statut === "en_cours" && isStale(s.dateDebut);
                return (
                  <div
                    key={s.id}
                    onClick={() => s.type === "groupée" && setSelectedId(s.id)}
                    style={{
                      display: "grid", gridTemplateColumns: "160px 1fr 110px 90px 80px 100px 40px",
                      padding: "12px 16px", cursor: s.type === "groupée" ? "pointer" : "default", alignItems: "center",
                      borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                      transition: "background .12s",
                      background: stale ? "#fffbeb" : undefined,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = stale ? "#fef3c7" : "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = stale ? "#fffbeb" : "#fff")}
                  >
                    {/* N° session */}
                    <div style={{ fontFamily: "monospace", fontSize: ".78rem", color: "#374151", fontWeight: 600 }}>
                      {s.numeroSession}
                      <div style={{ fontFamily: "inherit", fontSize: ".68rem", color: s.type === "simple" ? "#7c3aed" : "#64748b", marginTop: 3 }}>
                        {s.type === "simple" ? "Pesée simple" : "Pesée groupée"}
                      </div>
                    </div>

                    {/* Membre */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: ".88rem" }}>
                        {s.membreNom || s.fournisseurNom
                          ? `${s.membreNom ?? s.fournisseurNom} ${s.membrePrenoms ?? s.fournisseurPrenoms ?? ""}`
                          : <span style={{ color: "#94a3b8" }}>—</span>}
                      </div>
                      <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 1 }}>{s.produit}</div>
                      <div className="sessions-pesee-mobile-sacs">
                        {s.nbSacsTotal} sac{s.nbSacsTotal !== 1 ? "s" : ""}
                      </div>
                  </div>

                    {/* Date début */}
                    <div style={{ fontSize: ".78rem", color: "#64748b" }}>
                      {new Date(s.dateDebut).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>
                        {new Date(s.dateDebut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* Passages */}
                    <div style={{ fontWeight: 600, fontSize: ".88rem" }}>
                      {s.nbLignes} <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: ".72rem" }}>pass.</span>
                    </div>

                    {/* Sacs */}
                    <div style={{ fontWeight: 600, fontSize: ".88rem" }}>{s.nbSacsTotal}</div>

                    {/* Statut / Poids + badge stale */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <StatutBadge statut={s.statut} />
                        {stale && (
                          <span title="Session abandonnée depuis >8h">
                            <AlertTriangle size={13} color="#92400e" />
                          </span>
                        )}
                      </div>
                      {s.statut !== "en_cours" && (
                        <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#15803d", marginTop: 3 }}>
                          {fmtKg(s.poidsTotalKg)}
                        </div>
                      )}
                    </div>

                    {/* Chevron */}
                    <div style={{ textAlign: "right" }}>
                      <ChevronRight size={16} color="#cbd5e1" />
                    </div>
                  </div>
                );
              })}

              {/* Footer count */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", fontSize: ".75rem", color: "#94a3b8", textAlign: "right" }}>
                {filtered.length} session{filtered.length > 1 ? "s" : ""}
                {search && ` sur ${sessions.length}`}
                {nbStale > 0 && (
                  <span style={{ marginLeft: 8, color: "#92400e", fontWeight: 600 }}>
                    · {nbStale} abandonnée{nbStale > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail */}
      {selectedId !== null && (
        <SessionDetailModal sessionId={selectedId} onClose={() => setSelectedId(null)} canWrite={!isFeatureReadOnly} />
      )}
    </div>
  );
}
