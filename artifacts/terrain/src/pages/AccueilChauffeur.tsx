import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import { Truck, Fuel, MapPin, AlertTriangle, ChevronRight, ClipboardList, History, ArrowRight } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface MissionResume {
  id: number;
  type_mission: string;
  lieu_depart: string;
  lieu_arrivee: string;
  date_depart: string;
  statut: string;
  immatriculation: string | null;
}

interface BonResume {
  id: number;
  numero: string;
  type_carburant: string;
  quantite_autorisee: number;
  station_service: string | null;
  immatriculation: string | null;
}

interface AccueilData {
  missions_en_cours: MissionResume[];
  bons_en_attente: BonResume[];
  chauffeur_rattache: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const TYPE_LABEL: Record<string, string> = {
  collecte: "Collecte",
  livraison_exportateur: "Livraison",
  mission_achat: "Achat",
  autre: "Autre",
};

const STATUT_LABEL: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

const STATUT_COLOR: Record<string, string> = {
  planifiee: "var(--t-info)",
  en_cours: "var(--t-warning)",
  terminee: "var(--t-success)",
  annulee: "var(--t-danger)",
};

function initials(prenoms?: string, nom?: string) {
  return ((prenoms ?? "")[0] ?? "") + ((nom ?? "")[0] ?? "");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/* ─── Composant principal ────────────────────────────────────────────────── */

export default function AccueilChauffeur() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<AccueilData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AccueilData>("/chauffeur/accueil")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const heure = new Date().getHours();
  const salutation = heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";

  const bons = data?.bons_en_attente ?? [];
  const missions = data?.missions_en_cours ?? [];
  const prochaineMission = missions[0] ?? null;
  const totalLitres = bons.reduce((s, b) => s + b.quantite_autorisee, 0);

  /* ── Non rattaché ── */
  if (!data?.chauffeur_rattache && !loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--t-bg)", paddingBottom: 88 }}>
        <ChauffeurHeader salutation={salutation} user={user} missionCount={0} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", textAlign: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--t-warning-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={36} color="var(--t-warning)" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--t-text)" }}>Compte non rattaché</p>
            <p style={{ color: "var(--t-muted)", fontSize: "0.9rem", marginTop: 6, maxWidth: 280, lineHeight: 1.5 }}>
              Votre compte n'est pas encore lié à un chauffeur de la flotte. Contactez votre responsable transport.
            </p>
          </div>
        </div>
        <BottomNavChauffeur />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--t-bg)", paddingBottom: 88 }}>
      <ChauffeurHeader salutation={salutation} user={user} missionCount={missions.length} loading={loading} />

      {/* ── Aujourd'hui ── */}
      <p className="t-section-title">Aujourd'hui</p>
      <div style={{ padding: "0 16px 0" }}>
        {loading ? (
          <div style={{ height: 140, background: "var(--t-card)", borderRadius: "var(--t-radius)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }} />
        ) : prochaineMission ? (
          <MissionCard m={prochaineMission} onNavigate={() => navigate("/missions")} />
        ) : (
          <EmptyMissionCard onNavigate={() => navigate("/missions")} />
        )}
      </div>

      {/* ── Bons carburant ── */}
      {bons.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px" }}>
            <p className="t-section-title" style={{ padding: 0, margin: 0 }}>Bons carburant à utiliser</p>
            <button onClick={() => navigate("/carburant")}
              style={{ background: "none", border: "none", color: "var(--t-warning)", fontWeight: 700, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
              Voir <ChevronRight size={14} />
            </button>
          </div>
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {bons.map(bon => (
              <BonCard key={bon.id} bon={bon} onUse={() => navigate("/carburant")} onStation={() => navigate(`/station/${encodeURIComponent(bon.numero)}`)} />
            ))}
          </div>
        </>
      )}

      {/* ── Mon activité ── */}
      <p className="t-section-title">Mon activité</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 16px" }}>
        <StatTile icon={<Truck size={22} color="var(--t-primary)" />} value={loading ? "…" : String(missions.length)} label="Mission(s)" />
        <StatTile icon={<Fuel size={22} color="var(--t-warning)" />} value={loading ? "…" : `${totalLitres} L`} label="Carburant" />
        <StatTile icon={<ClipboardList size={22} color="var(--t-info)" />} value={loading ? "…" : String(bons.length)} label="Bon(s)" />
      </div>

      {/* ── Actions rapides ── */}
      <p className="t-section-title">Actions rapides</p>
      <div className="t-actions">
        <ActionTile icon="⛽" label="Carburant" sub="Gérer mes bons" onClick={() => navigate("/carburant")} />
        <ActionTile icon="🚚" label="Missions" sub="Toutes mes missions" onClick={() => navigate("/missions")} />
        <ActionTile icon="📍" label="Stations" sub="Trouver une station" onClick={() => navigate("/station")} />
        <ActionTile icon="📋" label="Historique" sub="Activité passée" onClick={() => navigate("/missions")} />
      </div>
    </div>
  );
}

/* ─── Sous-composants ────────────────────────────────────────────────────── */

function ChauffeurHeader({
  salutation, user, missionCount, loading = false,
}: {
  salutation: string;
  user: { prenoms?: string; nom?: string } | null;
  missionCount: number;
  loading?: boolean;
}) {
  return (
    <div style={{
      background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)",
      padding: "48px 20px 36px",
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        {/* Identité */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: "1.1rem",
            textTransform: "uppercase",
            border: "2px solid rgba(255,255,255,0.25)",
          }}>
            {initials(user?.prenoms, user?.nom)}
          </div>
          <div>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem" }}>{salutation} 👋</p>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.3rem", lineHeight: 1.2, margin: "2px 0 3px" }}>
              {user?.prenoms} {user?.nom}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.75rem" }}>Chauffeur</p>
          </div>
        </div>
        {/* Statut */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 4 }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.18)", borderRadius: 999,
            padding: "4px 10px", fontSize: "0.75rem", color: "#fff", fontWeight: 600,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            Disponible
          </span>
          {!loading && (
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.75rem" }}>
              {missionCount} mission{missionCount !== 1 ? "s" : ""} en cours
            </span>
          )}
        </div>
      </div>
      {/* Vague */}
      <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", display: "block" }}
        viewBox="0 0 375 24" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 24 C100 0 275 48 375 24 L375 24 L0 24Z" fill="var(--t-bg)" />
      </svg>
    </div>
  );
}

function MissionCard({
  m, onNavigate,
}: {
  m: MissionResume;
  onNavigate: () => void;
}) {
  const statutColor = STATUT_COLOR[m.statut] ?? "var(--t-muted)";
  const statutLabel = STATUT_LABEL[m.statut] ?? m.statut;

  return (
    <div className="t-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Barre colorée */}
      <div style={{ height: 4, background: `linear-gradient(to right, ${statutColor}, ${statutColor}aa)` }} />
      <div style={{ padding: "14px 16px" }}>
        {/* Titre + statut */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "var(--t-primary-light)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Truck size={18} color="var(--t-primary)" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--t-text)" }}>Prochaine mission</p>
              <p style={{ fontSize: "0.75rem", color: "var(--t-muted)" }}>{TYPE_LABEL[m.type_mission] ?? m.type_mission}</p>
            </div>
          </div>
          <span style={{
            fontSize: "0.72rem", fontWeight: 700,
            padding: "3px 10px", borderRadius: 999,
            background: `${statutColor}18`, color: statutColor,
          }}>
            {statutLabel}
          </span>
        </div>

        {/* Route */}
        <div style={{
          background: "var(--t-bg)", borderRadius: 10,
          padding: "10px 14px", display: "flex", alignItems: "center",
          gap: 10, marginBottom: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.7rem", color: "var(--t-muted)", marginBottom: 2 }}>Départ</p>
            <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.lieu_depart}</p>
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--t-card)", boxShadow: "0 1px 4px rgba(0,0,0,.1)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <ArrowRight size={14} color="var(--t-primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <p style={{ fontSize: "0.7rem", color: "var(--t-muted)", marginBottom: 2 }}>Arrivée</p>
            <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.lieu_arrivee}</p>
          </div>
        </div>

        {/* Date */}
        <p style={{ fontSize: "0.78rem", color: "var(--t-muted)", marginBottom: 14 }}>
          📅 {fmtDate(m.date_depart)}
          {m.immatriculation && <span style={{ fontFamily: "monospace", marginLeft: 8 }}>· {m.immatriculation}</span>}
        </p>

        {/* CTA */}
        <button className="t-btn t-btn--primary" onClick={onNavigate} style={{ height: 44, fontSize: "0.9rem" }}>
          Voir la mission <ChevronRight size={16} style={{ marginLeft: 4 }} />
        </button>
      </div>
    </div>
  );
}

function EmptyMissionCard({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="t-card" style={{ textAlign: "center" }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "var(--t-bg)", margin: "0 auto 12px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Truck size={24} color="var(--t-muted)" />
      </div>
      <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--t-text)" }}>Aucune mission planifiée</p>
      <p style={{ color: "var(--t-muted)", fontSize: "0.85rem", marginTop: 6, lineHeight: 1.5 }}>
        Vous n'avez aucune mission à effectuer aujourd'hui.
      </p>
      <button
        onClick={onNavigate}
        className="t-btn t-btn--ghost"
        style={{ height: 44, fontSize: "0.88rem", marginTop: 16 }}
      >
        Voir toutes mes missions <ChevronRight size={16} style={{ marginLeft: 4 }} />
      </button>
    </div>
  );
}

function BonCard({
  bon, onUse, onStation,
}: {
  bon: BonResume;
  onUse: () => void;
  onStation: () => void;
}) {
  return (
    <div className="t-card t-card--warning" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "var(--t-warning-bg)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Fuel size={20} color="var(--t-warning)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.8rem", color: "var(--t-primary)" }}>{bon.numero}</p>
          <p style={{ fontSize: "0.8rem", color: "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bon.immatriculation ?? "—"} · <strong>{bon.quantite_autorisee} L</strong> {bon.type_carburant}
          </p>
          {bon.station_service && (
            <p style={{ fontSize: "0.75rem", color: "var(--t-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bon.station_service}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onUse}
            style={{
              background: "var(--t-warning)", color: "#fff",
              border: "none", borderRadius: 8, padding: "8px 14px",
              fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            Utiliser
          </button>
          <button
            onClick={onStation}
            style={{
              background: "var(--t-warning-bg)", color: "var(--t-warning)",
              border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer",
            }}
          >
            <MapPin size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="t-stat">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>{icon}</div>
      <p className="t-stat__value" style={{ fontSize: "1.3rem" }}>{value}</p>
      <p className="t-stat__label">{label}</p>
    </div>
  );
}

function ActionTile({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button className="t-action" onClick={onClick} style={{ minHeight: 100, padding: "18px 12px" }}>
      <span className="t-action__icon">{icon}</span>
      <span className="t-action__label">{label}</span>
      <span style={{ fontSize: "0.72rem", color: "var(--t-muted)", fontWeight: 500 }}>{sub}</span>
    </button>
  );
}
