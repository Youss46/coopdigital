import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getAllOps } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import type { PendingOp } from "../lib/types";

const TYPE_LABELS: Record<string, string> = {
  collecte: "⚖️ Collecte",
  paiement: "💵 Paiement",
  avance:   "💰 Avance",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente",  color: "var(--t-warning)" },
  synced:  { label: "Synchronisé", color: "#16a34a" },
  error:   { label: "Échec",       color: "var(--t-danger)" },
};

function formatTs(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function opLabel(op: PendingOp): string {
  const d = op.data as unknown as Record<string, unknown>;
  if (op.type === "collecte") return `${d.poidsBrutKg ?? "?"}kg — membre #${d.membreId ?? "?"}`;
  if (op.type === "paiement") return `Livraison #${d.livraisonId ?? "?"} — membre #${d.membreId ?? "?"}`;
  if (op.type === "avance")   return `${Number(d.montantFcfa ?? 0).toLocaleString("fr-FR")} FCFA — membre #${d.membreId ?? "?"}`;
  return op.localId;
}

export default function SyncHistorique() {
  const [, setLocation] = useLocation();
  const { pendingCount, triggerSync, isOnline, syncStatus } = useOffline();
  const [ops, setOps]       = useState<PendingOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | "pending" | "synced" | "error">("all");

  async function reload() {
    setLoading(true);
    try {
      setOps(await getAllOps());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  // Recharger après une sync
  useEffect(() => {
    if (syncStatus === "done") void reload();
  }, [syncStatus]);

  const filtered = filter === "all" ? ops : ops.filter((o) => o.status === filter);

  const nbPending = ops.filter((o) => o.status === "pending").length;
  const nbSynced  = ops.filter((o) => o.status === "synced").length;
  const nbError   = ops.filter((o) => o.status === "error").length;

  return (
    <div className="t-app">
      <header className="t-header">
        <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        <div>
          <div className="t-header__title">Synchronisation</div>
          <div className="t-header__sub">
            {nbPending > 0 ? `${nbPending} en attente` : "Tout synchronisé"}
          </div>
        </div>
        {isOnline && pendingCount > 0 && (
          <button
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
            onClick={() => void triggerSync()}
            disabled={syncStatus === "syncing"}
          >
            {syncStatus === "syncing" ? "⏳" : "🔄 Sync"}
          </button>
        )}
      </header>

      <OfflineBanner />

      <main className="t-main t-main--no-nav" style={{ paddingBottom: 24 }}>
        {/* KPIs */}
        <div className="t-stats" style={{ margin: "16px 16px 0" }}>
          <div className="t-stat">
            <div className="t-stat__value" style={{ color: "var(--t-warning)" }}>{nbPending}</div>
            <div className="t-stat__label">En attente</div>
          </div>
          <div className="t-stat">
            <div className="t-stat__value" style={{ color: "#16a34a" }}>{nbSynced}</div>
            <div className="t-stat__label">Synchronisés</div>
          </div>
          <div className="t-stat">
            <div className="t-stat__value" style={{ color: "var(--t-danger)" }}>{nbError}</div>
            <div className="t-stat__label">Échecs</div>
          </div>
          <div className="t-stat">
            <div className="t-stat__value">{ops.length}</div>
            <div className="t-stat__label">Total</div>
          </div>
        </div>

        {/* Filtre */}
        <div style={{ display: "flex", gap: 8, padding: "16px 16px 0", overflowX: "auto" }}>
          {(["all", "pending", "synced", "error"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: ".8rem", whiteSpace: "nowrap",
                background: filter === f ? "var(--t-primary)" : "#f1f5f9",
                color: filter === f ? "#fff" : "var(--t-muted)",
              }}
            >
              {f === "all" ? "Tout" : f === "pending" ? "En attente" : f === "synced" ? "Synchronisés" : "Échecs"}
            </button>
          ))}
        </div>

        {loading && <div className="t-spinner" style={{ marginTop: 32 }} />}

        {!loading && filtered.length === 0 && (
          <div className="t-empty" style={{ marginTop: 32 }}>
            <div className="t-empty__icon">📭</div>
            <div className="t-empty__text">
              {filter === "all" ? "Aucune opération enregistrée" : "Aucune opération dans cette catégorie"}
            </div>
          </div>
        )}

        <div style={{ padding: "12px 16px 0" }}>
          {filtered.map((op) => {
            const st = STATUS_LABELS[op.status] ?? STATUS_LABELS.pending;
            return (
              <div key={op.localId} className="t-card" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: "1.3rem" }}>
                    {TYPE_LABELS[op.type]?.split(" ")[0] ?? "📋"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                      {TYPE_LABELS[op.type] ?? op.type}
                    </div>
                    <div className="t-text-muted" style={{ fontSize: ".8rem", marginTop: 2 }}>
                      {opLabel(op)}
                    </div>
                    <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginTop: 4 }}>
                      {formatTs(op.timestamp)}
                      {op.syncedAt && ` → synchronisé ${formatTs(op.syncedAt)}`}
                    </div>
                    {op.tentatives && op.tentatives > 1 && (
                      <div style={{ fontSize: ".75rem", color: "var(--t-warning)", marginTop: 2 }}>
                        {op.tentatives} tentative{op.tentatives !== 1 ? "s" : ""}
                      </div>
                    )}
                    {op.errorMsg && (
                      <div style={{ fontSize: ".75rem", color: "var(--t-danger)", marginTop: 4, background: "var(--t-danger-bg)", borderRadius: 6, padding: "4px 8px" }}>
                        {op.errorMsg}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: ".75rem", fontWeight: 700, color: st.color, whiteSpace: "nowrap" }}>
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Référence locale */}
        {filtered.length > 0 && (
          <div className="t-text-muted" style={{ textAlign: "center", padding: "16px", fontSize: ".75rem" }}>
            Identifiant local affiché à des fins de diagnostic
          </div>
        )}
      </main>
    </div>
  );
}
