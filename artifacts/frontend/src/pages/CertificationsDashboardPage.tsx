import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Award, Leaf, Star, ShieldCheck, Globe, FileText,
  CheckCircle, AlertTriangle, XCircle, Clock, Users,
  TrendingUp, ClipboardList, ChevronRight, RefreshCw,
} from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";
function getToken() { return localStorage.getItem("coop_token") ?? ""; }
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertifDashItem {
  id: number;
  type: string;
  statut: string;
  nomCertificateur: string | null;
  numeroCertificat: string | null;
  dateExpiration: string | null;
  daysLeft: number | null;
  membres: { certifies: number; enCours: number; nonConformes: number; total: number; tauxConformite: number };
  tonnageKg: number;
  missionsEnCours: number;
  campagne: { id: number; libelle: string } | null;
}

interface Dashboard {
  kpis: { total: number; actives: number; expirees: number; aRenouveler: number; membresCertifies: number };
  parCertification: CertifDashItem[];
  prochesExpiration: { id: number; type: string; dateExpiration: string | null; nomCertificateur: string | null }[];
  campagne: { id: number; libelle: string } | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  rainforest_alliance: { label: "Rainforest Alliance", Icon: Leaf,       color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  fairtrade:           { label: "Fairtrade",           Icon: Star,       color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  bio:                 { label: "Agriculture Bio",     Icon: ShieldCheck, color: "#059669", bg: "#ecfdf5", border: "#6ee7b7" },
  eudr:                { label: "EUDR",                Icon: Globe,      color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  utz:                 { label: "UTZ",                 Icon: Award,      color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  autre:               { label: "Autre",               Icon: FileText,   color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

const STATUT_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  actif:                   { label: "Actif",                   color: "#16a34a", Icon: CheckCircle   },
  renouvellement_en_cours: { label: "Renouvellement",          color: "#2563eb", Icon: RefreshCw     },
  suspendu:                { label: "Suspendu",                color: "#d97706", Icon: AlertTriangle  },
  expire:                  { label: "Expiré",                  color: "#dc2626", Icon: XCircle       },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTonnage(kg: number) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(0)} kg`;
}

// ─── Composants ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, Icon }: {
  label: string; value: number | string; sub?: string;
  color: string; Icon: React.ElementType;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ background: color + "18", borderRadius: 10, padding: 10, flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#111827", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: color, marginTop: 1, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "#f3f4f6", borderRadius: 99, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s" }} />
    </div>
  );
}

function CertifCard({ c }: { c: CertifDashItem }) {
  const meta   = TYPE_META[c.type] ?? TYPE_META["autre"]!;
  const statut = STATUT_META[c.statut] ?? STATUT_META["actif"]!;
  const { Icon } = meta;
  const { Icon: StatutIcon } = statut;

  const urgentExpiry = c.daysLeft !== null && c.daysLeft <= 90 && c.daysLeft >= 0;
  const expired      = c.statut === "expire";

  return (
    <Link href={`/certifications/${c.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "#fff", border: `1px solid ${expired ? "#fecaca" : urgentExpiry ? "#fde68a" : meta.border}`,
        borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14,
        cursor: "pointer", transition: "box-shadow 0.15s",
      }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: meta.bg, borderRadius: 9, padding: 8 }}>
              <Icon size={18} color={meta.color} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{meta.label}</div>
              {c.nomCertificateur && <div style={{ fontSize: 11, color: "#6b7280" }}>{c.nomCertificateur}</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: statut.color + "14", border: `1px solid ${statut.color}30`, borderRadius: 99, padding: "3px 10px" }}>
            <StatutIcon size={11} color={statut.color} />
            <span style={{ fontSize: 11, fontWeight: 600, color: statut.color }}>{statut.label}</span>
          </div>
        </div>

        {/* Expiration */}
        {c.dateExpiration && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: urgentExpiry || expired ? "#dc2626" : "#6b7280" }}>
            <Clock size={12} />
            {expired
              ? `Expirée le ${fmtDate(c.dateExpiration)}`
              : c.daysLeft !== null && c.daysLeft <= 90
                ? `Expire dans ${c.daysLeft} jour${c.daysLeft > 1 ? "s" : ""} (${fmtDate(c.dateExpiration)})`
                : `Expire le ${fmtDate(c.dateExpiration)}`
            }
          </div>
        )}

        {/* Conformité membres */}
        {c.membres.total > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                <Users size={12} />{c.membres.total} membres évalués
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{c.membres.tauxConformite}%</span>
            </div>
            <ProgressBar value={c.membres.tauxConformite} color={meta.color} />
            <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {c.membres.certifies} certifiés</span>
              <span style={{ color: "#d97706" }}>◑ {c.membres.enCours} en cours</span>
              <span style={{ color: "#dc2626" }}>✗ {c.membres.nonConformes} non conf.</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>Aucun membre évalué</div>
        )}

        {/* Footer : tonnage + missions */}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
          {c.campagne && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>{fmtTonnage(c.tonnageKg)}</span> — {c.campagne.libelle}
            </div>
          )}
          {c.missionsEnCours > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2563eb" }}>
              <ClipboardList size={11} />
              {c.missionsEnCours} mission{c.missionsEnCours > 1 ? "s" : ""} en cours
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>
          <ChevronRight size={14} color="#9ca3af" />
        </div>
      </div>
    </Link>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function CertificationsDashboardPage() {
  const { data, isLoading, refetch } = useQuery<Dashboard>({
    queryKey: ["certifications-dashboard"],
    queryFn: () => apiFetch("/api/certifications/dashboard"),
    staleTime: 60_000,
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>
            Tableau de bord — Certifications
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Vue synthétique de la conformité par type de certification
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => refetch()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#374151" }}>
            <RefreshCw size={14} />Actualiser
          </button>
          <Link href="/certifications" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#1a4731", color: "#fff", borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
            <Award size={14} />Gérer les certifications
          </Link>
          <Link href="/enquetes" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, textDecoration: "none", color: "#374151" }}>
            <ClipboardList size={14} />Missions d'enquête
          </Link>
        </div>
      </div>

      {isLoading || !data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: "#f3f4f6", borderRadius: 12, height: 80, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            <KpiCard label="Certifications actives"  value={data.kpis.actives}           color="#16a34a" Icon={CheckCircle}   />
            <KpiCard label="Membres certifiés"        value={data.kpis.membresCertifies}  color="#2563eb" Icon={Users}         />
            <KpiCard label="À renouveler (90 jours)"  value={data.kpis.aRenouveler}      color="#d97706" Icon={AlertTriangle} sub={data.kpis.aRenouveler > 0 ? "Action requise" : undefined} />
            <KpiCard label="Certifications expirées"  value={data.kpis.expirees}          color="#dc2626" Icon={XCircle}       sub={data.kpis.expirees > 0 ? "À régulariser" : undefined} />
          </div>

          {/* Alertes expiration */}
          {data.prochesExpiration.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 20px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} color="#d97706" />
                <span style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>
                  {data.prochesExpiration.length} certification{data.prochesExpiration.length > 1 ? "s" : ""} expire{data.prochesExpiration.length > 1 ? "nt" : ""} dans moins de 90 jours
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.prochesExpiration.map((c) => {
                  const meta = TYPE_META[c.type] ?? TYPE_META["autre"]!;
                  const days = c.dateExpiration
                    ? Math.round((new Date(c.dateExpiration).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <Link key={c.id} href={`/certifications/${c.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#374151", textDecoration: "none", padding: "6px 10px", background: "#fff8", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <meta.Icon size={13} color={meta.color} />
                        <span style={{ fontWeight: 600 }}>{meta.label}</span>
                        {c.nomCertificateur && <span style={{ color: "#9ca3af" }}>— {c.nomCertificateur}</span>}
                      </div>
                      <span style={{ color: days !== null && days <= 30 ? "#dc2626" : "#d97706", fontWeight: 600, fontSize: 12 }}>
                        {days !== null ? `${days} j` : fmtDate(c.dateExpiration)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grille certifications */}
          {data.parCertification.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
              <Award size={36} color="#d1d5db" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Aucune certification enregistrée</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>Commencez par ajouter votre première certification.</div>
              <Link href="/certifications" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#1a4731", color: "#fff", borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
                <Award size={14} />Ajouter une certification
              </Link>
            </div>
          ) : (
            <>
              {data.campagne && (
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={13} color="#16a34a" />
                  Tonnage affiché pour la campagne active : <strong style={{ color: "#111827" }}>{data.campagne.libelle}</strong>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {data.parCertification.map(c => <CertifCard key={c.id} c={c} />)}
              </div>
            </>
          )}

          {/* Liens rapides bottom */}
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <Link href="/enquetes" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, textDecoration: "none", color: "#374151", fontWeight: 500 }}>
              <ClipboardList size={14} color="#2563eb" />Voir toutes les missions d'enquête
            </Link>
            <Link href="/certifications" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, textDecoration: "none", color: "#374151", fontWeight: 500 }}>
              <Award size={14} color="#16a34a" />Gérer les certifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
