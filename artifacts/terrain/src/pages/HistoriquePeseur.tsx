import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, RefreshCw, Scale, Truck, Download,
  FileText, AlertTriangle, Package, Layers,
} from "lucide-react";
import { getPeseurCollectes, telechargerRecuLivraison, telechargerBordereauSession } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import type { PeseurCollecte } from "../lib/types";
import BottomNavPeseur from "../components/BottomNavPeseur";

const CACHE_KEY = "peseur_collectes_cache";

type DateFilters = {
  dateDebut?: string;
  dateFin?: string;
};

function dateLocaleDuJour(): string {
  const aujourdHui = new Date();
  const mois = String(aujourdHui.getMonth() + 1).padStart(2, "0");
  const jour = String(aujourdHui.getDate()).padStart(2, "0");
  return `${aujourdHui.getFullYear()}-${mois}-${jour}`;
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y?.slice(2)}`;
}

function filterCachedCollectes(collectes: PeseurCollecte[], filters: DateFilters): PeseurCollecte[] {
  return collectes.filter((collecte) => (
    (!filters.dateDebut || collecte.dateLivraison >= filters.dateDebut)
    && (!filters.dateFin || collecte.dateLivraison <= filters.dateFin)
  ));
}

function hasDateFilter(filters: DateFilters): boolean {
  return Boolean(filters.dateDebut || filters.dateFin);
}

function statutChip(s: string): { color: string; bg: string; label: string } {
  if (s === "PAYÉ")     return { color: "#16a34a", bg: "rgba(22,163,74,.12)",  label: "Payé" };
  if (s === "DIFFÉRÉ")  return { color: "#d97706", bg: "rgba(245,158,11,.12)", label: "Différé" };
  return { color: "#6b7280", bg: "rgba(148,163,184,.1)", label: s };
}

export default function HistoriquePeseur() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [collectes, setCollectes] = useState<PeseurCollecte[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadErreur, setDownloadErreur] = useState<string | null>(null);
  const [dateDuJour] = useState(dateLocaleDuJour);
  const [dateDebutSaisie, setDateDebutSaisie] = useState(dateDuJour);
  const [dateFinSaisie, setDateFinSaisie] = useState(dateDuJour);
  const [filtresActifs, setFiltresActifs] = useState<DateFilters>({
    dateDebut: dateDuJour,
    dateFin: dateDuJour,
  });
  const [filtreErreur, setFiltreErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const data = await getPeseurCollectes(filtresActifs);
      setCollectes(data);
      setFromCache(false);
      if (!hasDateFilter(filtresActifs)) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    } catch (e) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const cachedCollectes = JSON.parse(cached) as PeseurCollecte[];
          setCollectes(filterCachedCollectes(cachedCollectes, filtresActifs));
          setFromCache(true);
          return;
        }
      } catch {}
      setErreur((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filtresActifs]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const cachedCollectes = JSON.parse(cached) as PeseurCollecte[];
        setCollectes(filterCachedCollectes(cachedCollectes, filtresActifs));
        setFromCache(true);
        setLoading(false);
      }
    } catch {}
    void charger();
  }, [charger, filtresActifs]);

  function appliquerFiltre() {
    if (dateDebutSaisie && dateFinSaisie && dateDebutSaisie > dateFinSaisie) {
      setFiltreErreur("La date de début doit être antérieure ou égale à la date de fin.");
      return;
    }
    setFiltreErreur(null);
    const dateUnique = dateDebutSaisie || dateFinSaisie;
    setFiltresActifs({
      dateDebut: dateDebutSaisie || dateUnique || undefined,
      dateFin: dateFinSaisie || dateUnique || undefined,
    });
  }

  function reinitialiserFiltre() {
    setDateDebutSaisie("");
    setDateFinSaisie("");
    setFiltreErreur(null);
    setFiltresActifs({});
  }

  const totalPoids   = collectes.reduce((s, c) => s + c.poidsKg, 0);
  const totalMontant = collectes.filter((c) => c.type !== "reception_transfert").reduce((s, c) => s + c.montantNetFcfa, 0);

  return (
    <div className="t-app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="t-header t-header--peseur">
        <button
          className="t-header__back"
          onClick={() => setLocation("/")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Mes collectes</div>
          <div className="t-header__sub">
            {loading ? "Chargement…" : `${collectes.length} entrée${collectes.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        {!loading && isOnline && (
          <button
            onClick={() => void charger()}
            style={{
              background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)",
              borderRadius: 8, color: "#fff", padding: "7px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <RefreshCw size={16} />
          </button>
        )}
      </header>

      <main className="t-main" style={{ padding: "16px 16px 0" }}>
        {/* Bannière hors-ligne/cache */}
        {(fromCache || !isOnline) && (
          <div style={{
            marginBottom: 12, padding: "8px 14px",
            background: "var(--t-warning-bg)", border: "1px solid rgba(217,119,6,.2)",
            borderRadius: 10, fontSize: ".8rem", color: "var(--t-warning)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <RefreshCw size={13} />
            {isOnline ? "Données en cache — actualisation en cours…" : "Hors ligne — données en cache"}
          </div>
        )}

        {/* Filtre date / période */}
        <section style={{
          background: "var(--t-card)", borderRadius: 12, marginBottom: 14,
          padding: "12px", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--t-text)" }}>Filtrer par date</div>
              <div style={{ fontSize: ".69rem", color: "var(--t-muted)", marginTop: 1 }}>
                Une date pour la journée, deux dates pour une période
              </div>
            </div>
            {hasDateFilter(filtresActifs) && (
              <button
                onClick={reinitialiserFiltre}
                style={{
                  border: "none", background: "transparent", color: "var(--t-primary)",
                  fontSize: ".72rem", fontWeight: 700, cursor: "pointer", padding: "4px 0",
                }}
              >
                Tout afficher
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: ".7rem", color: "var(--t-muted)", fontWeight: 600 }}>
              Du
              <input
                type="date"
                value={dateDebutSaisie}
                max={dateFinSaisie || undefined}
                onChange={(event) => { setDateDebutSaisie(event.target.value); setFiltreErreur(null); }}
                style={{
                  width: "100%", minWidth: 0, padding: "8px", borderRadius: 8,
                  border: "1px solid var(--t-border)", color: "var(--t-text)",
                  background: "var(--t-bg)", fontSize: ".78rem",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: ".7rem", color: "var(--t-muted)", fontWeight: 600 }}>
              Au
              <input
                type="date"
                value={dateFinSaisie}
                min={dateDebutSaisie || undefined}
                onChange={(event) => { setDateFinSaisie(event.target.value); setFiltreErreur(null); }}
                style={{
                  width: "100%", minWidth: 0, padding: "8px", borderRadius: 8,
                  border: "1px solid var(--t-border)", color: "var(--t-text)",
                  background: "var(--t-bg)", fontSize: ".78rem",
                }}
              />
            </label>
          </div>

          {filtreErreur && (
            <div style={{ marginTop: 7, color: "var(--t-danger)", fontSize: ".7rem" }}>{filtreErreur}</div>
          )}

          <button
            onClick={appliquerFiltre}
            disabled={loading || (!dateDebutSaisie && !dateFinSaisie)}
            className="t-btn t-btn--primary"
            style={{ width: "100%", minHeight: 38, marginTop: 10, fontSize: ".78rem" }}
          >
            {loading ? "Chargement…" : "Appliquer le filtre"}
          </button>
        </section>

        {/* KPI band */}
        {collectes.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8, marginBottom: 14,
          }}>
            <div className="t-kpi">
              <div className="t-kpi__icon" style={{ background: "rgba(26,71,49,.08)" }}>
                <Scale size={16} color="var(--t-primary)" />
              </div>
              <div className="t-kpi__value" style={{ color: "var(--t-primary)" }}>
                {collectes.length}
              </div>
              <div className="t-kpi__label">Livraisons</div>
            </div>
            <div className="t-kpi">
              <div className="t-kpi__icon" style={{ background: "rgba(8,145,178,.08)" }}>
                <Layers size={16} color="var(--t-peseur)" />
              </div>
              <div className="t-kpi__value" style={{ fontSize: "1.1rem", color: "var(--t-peseur)" }}>
                {totalPoids >= 1000
                  ? (totalPoids / 1000).toFixed(2) + "T"
                  : totalPoids.toLocaleString("fr-FR") + "kg"}
              </div>
              <div className="t-kpi__label">Total</div>
            </div>
            <div className="t-kpi">
              <div className="t-kpi__icon" style={{ background: "rgba(22,163,74,.08)" }}>
                <Package size={16} color="var(--t-success)" />
              </div>
              <div className="t-kpi__value" style={{ fontSize: ".82rem", color: "var(--t-success)", wordBreak: "break-all" }}>
                {totalMontant.toLocaleString("fr-FR")}
              </div>
              <div className="t-kpi__label">FCFA net</div>
            </div>
          </div>
        )}

        {/* Erreur chargement */}
        {erreur && (
          <div style={{
            marginBottom: 12, padding: "10px 14px",
            background: "var(--t-danger-bg)", border: "1px solid var(--t-danger)",
            borderRadius: 10, fontSize: ".85rem", color: "var(--t-danger)",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <AlertTriangle size={15} />
            <span style={{ flex: 1 }}>{erreur}</span>
          </div>
        )}

        {/* Erreur téléchargement */}
        {downloadErreur && (
          <div
            style={{
              marginBottom: 12, padding: "10px 14px",
              background: "var(--t-danger-bg)", border: "1px solid var(--t-danger)",
              borderRadius: 10, fontSize: ".85rem", color: "var(--t-danger)", cursor: "pointer",
              display: "flex", gap: 8, alignItems: "center",
            }}
            onClick={() => setDownloadErreur(null)}
          >
            <AlertTriangle size={15} />
            <span style={{ flex: 1 }}>{downloadErreur}</span>
            <span style={{ opacity: .6, fontSize: ".75rem" }}>fermer</span>
          </div>
        )}

        {/* Spinner */}
        {loading && collectes.length === 0 && (
          <div className="t-spinner" style={{ marginTop: 40 }} />
        )}

        {/* Liste vide */}
        {!loading && collectes.length === 0 && !erreur && (
          <div className="t-empty" style={{ marginTop: 40 }}>
            <div className="t-empty__icon">
              <Scale size={44} color="var(--t-muted)" strokeWidth={1.2} />
            </div>
            <div className="t-empty__text">
              {hasDateFilter(filtresActifs) ? "Aucune collecte pour cette période" : "Aucune collecte enregistrée"}
            </div>
          </div>
        )}

        {/* Liste des collectes */}
        <div style={{ paddingBottom: 24 }}>
          {collectes.map((c) => {
            const isTransfert = c.type === "reception_transfert";
            const st = statutChip(c.statutPaiement);
            const isDownloading = downloadingId === c.id;

            return (
              <div
                key={`${isTransfert ? "tr" : "lv"}-${c.id}`}
                style={{
                  background: "var(--t-card)",
                  borderRadius: 14, marginBottom: 8,
                  boxShadow: "0 1px 4px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.04)",
                  overflow: "hidden",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "flex-start",
                  gap: 12, padding: "12px 14px",
                }}>
                  {/* Icône type */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: isTransfert ? "var(--t-peseur-bg)" : "rgba(26,71,49,.08)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                  }}>
                    {isTransfert
                      ? <Truck size={18} color="var(--t-peseur)" />
                      : <Scale size={18} color="var(--t-primary)" />}
                  </div>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isTransfert ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: ".9rem", marginBottom: 1 }}>
                          Réception transfert
                        </div>
                        <div style={{ fontSize: ".76rem", color: "var(--t-muted)", marginBottom: 4 }}>
                          {c.entrepotNom ?? "—"}{c.transfertNumero ? ` · ${c.transfertNumero}` : ""}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, fontSize: ".9rem", marginBottom: 1 }}>
                          {c.membreNom} {c.membrePrenoms}
                        </div>
                        {c.membreCode && (
                          <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginBottom: 4, fontFamily: "monospace" }}>
                            {c.membreCode}
                          </div>
                        )}
                      </>
                    )}

                    {/* Métriques */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".82rem" }}>
                      <span style={{ color: "var(--t-text)", fontWeight: 600 }}>
                        {c.poidsKg.toLocaleString("fr-FR")} kg
                      </span>
                      {!isTransfert && (
                        <span style={{ color: "var(--t-muted)" }}>
                          {c.montantNetFcfa.toLocaleString("fr-FR")} FCFA
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {!isTransfert && (
                      <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {c.fromSession && (
                          <span style={{
                            fontSize: ".68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 8,
                            color: "var(--t-peseur)", background: "var(--t-peseur-bg)",
                          }}>
                            Groupée
                          </span>
                        )}
                        {c.planAvanceType === "reporte" && (
                          <span style={{
                            fontSize: ".68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 8,
                            color: "var(--t-warning)", background: "var(--t-warning-bg)",
                          }}>
                            Avance reportée
                          </span>
                        )}
                        {c.planAvanceType === "partiel" && (
                          <span style={{
                            fontSize: ".68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 8,
                            color: "#fb923c", background: "rgba(251,146,60,.12)",
                          }}>
                            Avance partielle
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Droite : date + statut + bouton */}
                  <div style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "flex-end", gap: 5, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: ".7rem", color: "var(--t-muted)" }}>
                      {formatDate(c.dateLivraison)}
                    </span>

                    {!isTransfert && (
                      <span style={{
                        fontSize: ".7rem", fontWeight: 700, padding: "3px 8px", borderRadius: 10,
                        color: st.color, background: st.bg,
                      }}>
                        {st.label}
                      </span>
                    )}

                    {/* Bouton téléchargement */}
                    {isOnline && !isTransfert && (
                      <button
                        disabled={isDownloading}
                        onClick={async () => {
                          setDownloadingId(c.id);
                          setDownloadErreur(null);
                          try { await telechargerRecuLivraison(c.id); }
                          catch (e) { setDownloadErreur((e as Error).message || "Erreur téléchargement"); }
                          setDownloadingId(null);
                        }}
                        style={{
                          background: isDownloading ? "var(--t-bg)" : "rgba(26,71,49,.08)",
                          border: "1px solid rgba(26,71,49,.2)",
                          borderRadius: 8, color: "var(--t-primary)",
                          fontSize: ".7rem", fontWeight: 700,
                          padding: "5px 8px", cursor: isDownloading ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {isDownloading
                          ? <RefreshCw size={12} style={{ animation: "t-spin .8s linear infinite" }} />
                          : <FileText size={12} />}
                        {isDownloading ? "…" : "Reçu"}
                      </button>
                    )}

                    {isOnline && isTransfert && c.sessionId && (
                      <button
                        disabled={isDownloading}
                        onClick={async () => {
                          setDownloadingId(c.id);
                          setDownloadErreur(null);
                          try { await telechargerBordereauSession(c.sessionId!); }
                          catch (e) { setDownloadErreur((e as Error).message || "Erreur téléchargement"); }
                          setDownloadingId(null);
                        }}
                        style={{
                          background: isDownloading ? "var(--t-bg)" : "var(--t-peseur-bg)",
                          border: "1px solid rgba(8,145,178,.25)",
                          borderRadius: 8, color: "var(--t-peseur)",
                          fontSize: ".7rem", fontWeight: 700,
                          padding: "5px 8px", cursor: isDownloading ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Download size={12} />
                        {isDownloading ? "…" : "Bordereau"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <BottomNavPeseur />
    </div>
  );
}
