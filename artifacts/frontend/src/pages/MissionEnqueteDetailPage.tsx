import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, ArrowLeft, Users, Calendar, CheckCircle, Clock,
  AlertTriangle, Loader2, ChevronDown, ChevronUp, User,
  CheckCheck, BarChart2, FileText, UserCheck, Download, XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";
function getToken() { return localStorage.getItem("coop_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...options, headers: { ...authHeader(), ...(options?.headers as Record<string,string> ?? {}) } });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (text.trimStart().startsWith("<")) throw new Error(`HTTP ${r.status} — route introuvable (réponse HTML reçue)`);
    const b = JSON.parse(text || "{}") as { erreur?: string };
    throw new Error(b.erreur ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (text.trimStart().startsWith("<")) throw new Error(`HTTP ${r.status} — route introuvable (réponse HTML reçue)`);
    const b = JSON.parse(text || "{}") as { erreur?: string };
    throw new Error(b.erreur ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReponsesCriteres {
  [critere: string]: { valeur: "oui" | "non" | "na"; commentaire?: string };
}

interface EnqueteMembre {
  id: number;
  membreId: number;
  statut: string;
  reponses: ReponsesCriteres | null;
  scoreCalcule: number | null;
  statutConformite: string | null;
  notesAgent: string | null;
  commentaireRt: string | null;
  dateRejet: string | null;
  dateCollecte: string | null;
  membreNom: string;
  membrePrenom: string;
  membreCode: string | null;
  membreVillage: string | null;
}

interface MissionDetail {
  id: number;
  titre: string;
  certificationId: number;
  datePrevue: string;
  statut: string;
  objectifMembres: number | null;
  membresTotal: number;
  membresCollectes: number;
  membresValides: number;
  agentId: number | null;
  agentNom: string | null;
  agentPrenom: string | null;
  instructions: string | null;
  membres: EnqueteMembre[];
}

const STATUT_CONFORMITE_CONFIG: Record<string, { label: string; color: string }> = {
  certifie:      { label: "Certifiable", color: "#22c55e" },
  en_cours:      { label: "En cours",    color: "#f59e0b" },
  non_conforme:  { label: "Non conforme", color: "#ef4444" },
};

const STATUT_COLLECTE: Record<string, { label: string; color: string }> = {
  a_faire:  { label: "À faire",   color: "#6b7280" },
  collecte: { label: "Collecté",  color: "#3b82f6" },
  valide:   { label: "Validé",    color: "#22c55e" },
  rejete:   { label: "Refusé",    color: "#ef4444" },
};

// ── Modal de rejet ─────────────────────────────────────────────────────────────

function RejetModal({ onConfirm, onCancel, loading }: {
  onConfirm: (motif: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [motif, setMotif] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <XCircle size={20} style={{ color: "#ef4444" }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Refuser cette collecte</h3>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
          L'agent devra recommencer la collecte pour ce membre. Indiquez un motif clair.
        </p>
        <textarea
          autoFocus
          value={motif}
          onChange={e => setMotif(e.target.value)}
          rows={3}
          placeholder="Ex : Réponses incomplètes, incohérence sur les critères eau…"
          style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13 }}>
            Annuler
          </button>
          <button
            onClick={() => motif.trim() && onConfirm(motif.trim())}
            disabled={!motif.trim() || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: motif.trim() && !loading ? "#ef4444" : "#f87171", color: "#fff", cursor: motif.trim() && !loading ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>
            {loading ? "Envoi…" : "Refuser"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant détail membre ────────────────────────────────────────────────────

function MembreEnqueteCard({ m, canValidate, onValider, onRejeter }: {
  m: EnqueteMembre;
  canValidate: boolean;
  onValider: (membreId: number) => void;
  onRejeter: (membreId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const sc = STATUT_COLLECTE[m.statut] ?? STATUT_COLLECTE["a_faire"]!;
  const conf = m.statutConformite ? (STATUT_CONFORMITE_CONFIG[m.statutConformite] ?? null) : null;
  const criteres = m.reponses ? Object.entries(m.reponses) : [];
  const nb = {
    oui: criteres.filter(([, r]) => r.valeur === "oui").length,
    non: criteres.filter(([, r]) => r.valeur === "non").length,
    na:  criteres.filter(([, r]) => r.valeur === "na").length,
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${m.statut === "rejete" ? "#fecaca" : "#f1f5f9"}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <User size={18} style={{ color: "#6b7280" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{m.membrePrenom} {m.membreNom}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{m.membreCode ?? "—"} · {m.membreVillage ?? "—"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, background: `${sc.color}18`, padding: "2px 8px", borderRadius: 4 }}>
            {sc.label}
          </span>
          {conf && (
            <span style={{ fontSize: 11, fontWeight: 600, color: conf.color, background: `${conf.color}18`, padding: "2px 8px", borderRadius: 4 }}>
              {conf.label}
            </span>
          )}
          {m.scoreCalcule !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: m.scoreCalcule >= 70 ? "#22c55e" : m.scoreCalcule >= 40 ? "#f59e0b" : "#ef4444" }}>
              {m.scoreCalcule}%
            </span>
          )}
          {m.statut === "collecte" && canValidate && (
            <>
              <button onClick={e => { e.stopPropagation(); onValider(m.membreId); }}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                <CheckCheck size={13} />Valider
              </button>
              <button onClick={e => { e.stopPropagation(); onRejeter(m.membreId); }}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#fff", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                <XCircle size={13} />Refuser
              </button>
            </>
          )}
          {(m.statut !== "a_faire") && (
            <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {open ? <ChevronUp size={16} style={{ color: "#6b7280" }} /> : <ChevronDown size={16} style={{ color: "#6b7280" }} />}
            </button>
          )}
        </div>
      </div>

      {/* Aperçu motif de rejet même en fermé */}
      {m.statut === "rejete" && m.commentaireRt && (
        <div style={{ background: "#fef2f2", borderTop: "1px solid #fecaca", padding: "8px 16px", fontSize: 12, color: "#991b1b", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Motif de refus :</strong> {m.commentaireRt}</span>
        </div>
      )}

      {open && (
        <div style={{ borderTop: "1px solid #f8fafc", padding: "12px 16px", background: "#fafafa" }}>
          {m.notesAgent && (
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#92400e" }}>
              <strong>Note agent :</strong> {m.notesAgent}
            </div>
          )}
          {m.dateCollecte && (
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
              Collecté le {new Date(m.dateCollecte).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          )}
          {m.reponses && criteres.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 4 }}>✓ {nb.oui} Oui</span>
                <span style={{ fontSize: 12, background: "#fee2e2", color: "#991b1b", padding: "3px 10px", borderRadius: 4 }}>✗ {nb.non} Non</span>
                {nb.na > 0 && <span style={{ fontSize: 12, background: "#f3f4f6", color: "#6b7280", padding: "3px 10px", borderRadius: 4 }}>— {nb.na} N/A</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {criteres.map(([critere, rep]) => (
                  <div key={critere} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
                      background: rep.valeur === "oui" ? "#dcfce7" : rep.valeur === "non" ? "#fee2e2" : "#f3f4f6",
                      color: rep.valeur === "oui" ? "#166534" : rep.valeur === "non" ? "#991b1b" : "#6b7280",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                      {rep.valeur === "oui" ? "✓" : rep.valeur === "non" ? "✗" : "—"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "#374151" }}>{critere}</span>
                      {rep.commentaire && <div style={{ color: "#6b7280", fontStyle: "italic", marginTop: 2 }}>{rep.commentaire}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {!m.reponses && m.statut === "rejete" && (
            <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>Réponses effacées après le refus — l'agent doit recommencer.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page détail mission ────────────────────────────────────────────────────────

export default function MissionEnqueteDetailPage() {
  const { utilisateur: user } = useAuth();
  const [, params] = useRoute("/enquetes/:id");
  const missionId = Number(params?.id);
  const qc = useQueryClient();
  const [filterStatut, setFilterStatut] = useState("tous");
  const [rejetMembreId, setRejetMembreId] = useState<number | null>(null);

  const { data: mission, isLoading, isError, error } = useQuery<MissionDetail>({
    queryKey: ["enquete", missionId],
    queryFn: () => apiFetch(`/api/enquetes/${missionId}`),
    enabled: !!missionId,
    retry: 1,
  });

  const validerMutation = useMutation({
    mutationFn: (membreId: number) => apiPost(`/api/enquetes/${missionId}/membres/${membreId}/valider`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enquete", missionId] }),
  });

  const rejeterMutation = useMutation({
    mutationFn: ({ membreId, commentaireRt }: { membreId: number; commentaireRt: string }) =>
      apiPost(`/api/enquetes/${missionId}/membres/${membreId}/rejeter`, { commentaireRt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enquete", missionId] });
      setRejetMembreId(null);
    },
  });

  const statutMutation = useMutation({
    mutationFn: (statut: string) => apiFetch<unknown>(`/api/enquetes/${missionId}/statut`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enquete", missionId] }),
  });

  const canValidate = ["pca", "directeur", "responsable_tracabilite"].includes(user?.role ?? "");

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#16a34a" }} />
      </div>
    );
  }

  if (isError || !mission) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", gap: 16, padding: 24 }}>
        <AlertTriangle size={32} style={{ color: "#ef4444" }} />
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>Impossible de charger la mission</p>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", textAlign: "center", maxWidth: 340 }}>
          {(error as Error)?.message ?? "Une erreur est survenue. Vérifiez votre connexion et réessayez."}
        </p>
        <Link href="/enquetes" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, color: "#16a34a", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
          <ArrowLeft size={14} />Retour aux missions
        </Link>
      </div>
    );
  }

  const membres = mission.membres ?? [];
  const filtered = membres.filter(m => filterStatut === "tous" || m.statut === filterStatut);

  const total    = membres.length;
  const collectes = membres.filter(m => m.statut !== "a_faire" && m.statut !== "rejete").length;
  const valides  = membres.filter(m => m.statut === "valide").length;
  const rejetes  = membres.filter(m => m.statut === "rejete").length;
  const pct      = total > 0 ? Math.round((collectes / total) * 100) : 0;
  const certifies = membres.filter(m => m.statutConformite === "certifie").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <Link href="/enquetes" style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 13, textDecoration: "none", marginBottom: 12 }}>
            <ArrowLeft size={14} />Retour aux missions
          </Link>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <ClipboardList size={20} style={{ color: "#16a34a" }} />
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{mission.titre}</h1>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6b7280" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar size={12} />{new Date(mission.datePrevue).toLocaleDateString("fr-FR")}
                </span>
                {mission.agentNom && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={12} />{mission.agentPrenom} {mission.agentNom}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={`/api/enquetes/${missionId}/rapport.pdf`}
                target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                <Download size={15} />Rapport PDF
              </a>
              {canValidate && mission.statut === "soumise" && (
                <button onClick={() => statutMutation.mutate("validee")}
                  disabled={statutMutation.isPending}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle size={15} />{statutMutation.isPending ? "…" : "Valider la mission"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        {mission.instructions && (
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400e", display: "flex", gap: 8 }}>
            <FileText size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{mission.instructions}</span>
          </div>
        )}

        {/* Alerte collectes refusées */}
        {rejetes > 0 && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#991b1b", display: "flex", gap: 8 }}>
            <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong>{rejetes} collecte{rejetes > 1 ? "s" : ""} refusée{rejetes > 1 ? "s" : ""}</strong> — l'agent doit recommencer ces enquêtes.</span>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Membres",     value: total,    color: "#6b7280" },
            { label: "Collectés",   value: collectes, color: "#3b82f6" },
            { label: "Validés",     value: valides,  color: "#22c55e" },
            { label: "Certifiables",value: certifies, color: "#16a34a" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #f1f5f9", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Barre de progression */}
        <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            <span>Avancement de la collecte</span>
            <span style={{ color: pct === 100 ? "#22c55e" : "#16a34a" }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#22c55e" : "#16a34a", borderRadius: 4, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Filtres membres */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { key: "tous",    label: "Tous" },
            { key: "a_faire", label: "À faire" },
            { key: "collecte",label: "Collectés" },
            { key: "valide",  label: "Validés" },
            { key: "rejete",  label: "Refusés" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatut(f.key)} style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid",
              borderColor: filterStatut === f.key ? (f.key === "rejete" ? "#ef4444" : "#16a34a") : "#e5e7eb",
              background: filterStatut === f.key ? (f.key === "rejete" ? "#fef2f2" : "#f0fdf4") : "#fff",
              color: filterStatut === f.key ? (f.key === "rejete" ? "#ef4444" : "#16a34a") : "#6b7280",
              fontSize: 12, cursor: "pointer", fontWeight: filterStatut === f.key ? 600 : 400,
            }}>{f.label} ({membres.filter(m => f.key === "tous" || m.statut === f.key).length})</button>
          ))}
        </div>

        {/* Liste membres */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #f1f5f9", padding: 30, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              Aucun membre dans cette catégorie
            </div>
          )}
          {filtered.map(m => (
            <MembreEnqueteCard
              key={m.id} m={m}
              canValidate={canValidate}
              onValider={(mid) => validerMutation.mutate(mid)}
              onRejeter={(mid) => setRejetMembreId(mid)}
            />
          ))}
        </div>
      </div>

      {/* Modal de rejet */}
      {rejetMembreId !== null && (
        <RejetModal
          loading={rejeterMutation.isPending}
          onCancel={() => setRejetMembreId(null)}
          onConfirm={(motif) => rejeterMutation.mutate({ membreId: rejetMembreId, commentaireRt: motif })}
        />
      )}
    </div>
  );
}
