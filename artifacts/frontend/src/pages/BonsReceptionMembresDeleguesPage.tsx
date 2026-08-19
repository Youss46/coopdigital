/**
 * BonsReceptionMembresDeleguesPage
 *
 * Accessible au magasinier. Permet de créer un bon de réception le jour J
 * quand un membre délégué de localités arrive au magasin central avec son cacao.
 * Le bon contient les informations de transport et les frais avancés par la coop.
 * Il est ensuite traité par le peseur depuis son app terrain.
 */
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Truck, Plus, X, CheckCircle2, Clock, Scale, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import {
  getGetChauffeursQueryKey,
  getGetVehiculesQueryKey,
  useGetVehicules,
  useGetChauffeurs,
} from "@workspace/api-client-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `HTTP ${r.status}`); }
  return r.json() as Promise<T>;
}

async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `HTTP ${r.status}`); }
  return r.json();
}

async function apiDelete(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `HTTP ${r.status}`); }
  return r.json();
}

function fmt(n: number) { return n.toLocaleString("fr-FR"); }
function fmtDate(d: string) {
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Membre { id: number; nom: string; prenoms: string | null; section: string | null; telephone: string | null; }
interface BonReception {
  id: number;
  membreDelegueId: number;
  membreNom: string | null;
  membrePrenoms: string | null;
  membreSection: string | null;
  statut: "en_attente_pesee" | "en_pesee" | "terminee" | "annulee";
  poidsDeclaraKg: number | null;
  nombreSacsDeclares: number | null;
  typeTransport: "cooperatif" | "externe";
  vehiculeId: number | null;
  chauffeurId: number | null;
  typeVehicule: string | null;
  immatriculation: string | null;
  nomChauffeur: string | null;
  telephoneChauffeur: string | null;
  fraisCarburantFcfa: number;
  autresChargesFcfa: number;
  autresChargesLibelle: string | null;
  notes: string | null;
  sessionPeseeId: number | null;
  createdAt: string;
}

const STATUT_CONF = {
  en_attente_pesee: { label: "En attente de pesée", color: "#d97706", bg: "#fffbeb" },
  en_pesee:         { label: "Pesée en cours",       color: "#0891b2", bg: "#ecfeff" },
  terminee:         { label: "Terminé",               color: "#16a34a", bg: "#f0fdf4" },
  annulee:          { label: "Annulé",                color: "#9ca3af", bg: "#f9fafb" },
} as const;

const TYPE_VEHICULE_OPTIONS = ["Camion", "Pick-up", "Moto", "Pirogue", "Autre"];

// ─── Valeur initiale du formulaire ────────────────────────────────────────────

const FORM_INIT = {
  membreDelegueId: "",
  poidsDeclaraKg: "",
  nombreSacsDeclares: "",
  typeTransport: "cooperatif" as "cooperatif" | "externe",
  vehiculeId: "",
  chauffeurId: "",
  typeVehicule: "",
  immatriculation: "",
  nomChauffeur: "",
  telephoneChauffeur: "",
  fraisCarburantFcfa: "",
  autresChargesFcfa: "",
  autresChargesLibelle: "",
  notes: "",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BonsReceptionMembresDeleguesPage() {
  const qc = useQueryClient();
  const search = useSearch();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_INIT);
  const [filtreStatut, setFiltreStatut] = useState<string>("actifs");

  // Pré-remplissage depuis ?membre_id=X (navigué depuis DeleguesLocalitesPage)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const membreId = params.get("membre_id");
    if (membreId) {
      setForm(f => ({ ...f, membreDelegueId: membreId }));
      setShowForm(true);
    }
  }, [search]);

  // ── Données ──────────────────────────────────────────────────────────────
  const {
    data: membresData,
    isLoading: isLoadingMembres,
    isError: isMembresError,
    error: membresError,
    refetch: refetchMembres,
  } = useQuery({
    queryKey: ["membres-delegues-localites"],
    queryFn: () => apiFetch<Membre[]>(`/api/pesee/membres-delegues`),
  });
  const membres = membresData ?? [];

  const { data: vehiculesData } = useGetVehicules({
    query: {
      queryKey: getGetVehiculesQueryKey(),
      enabled: form.typeTransport === "cooperatif",
    },
  });
  const vehicules = vehiculesData?.vehicules ?? [];

  const { data: chauffeursData } = useGetChauffeurs({
    query: {
      queryKey: getGetChauffeursQueryKey(),
      enabled: form.typeTransport === "cooperatif",
    },
  });
  const chauffeurs = chauffeursData?.chauffeurs ?? [];

  const statutsQuery = filtreStatut === "actifs"
    ? "en_attente_pesee,en_pesee"
    : filtreStatut === "termines"
      ? "terminee"
      : "en_attente_pesee,en_pesee,terminee,annulee";

  const { data: bonsData, isLoading, refetch } = useQuery({
    queryKey: ["bons-reception", filtreStatut],
    queryFn: () => apiFetch<BonReception[]>(`/api/pesee/bons-reception?statuts=${statutsQuery}`),
  });
  const bons = bonsData ?? [];

  // ── Mutation créer ────────────────────────────────────────────────────────
  const mutCreer = useMutation({
    mutationFn: () => apiPost("/api/pesee/bons-reception", {
      membreDelegueId:      Number(form.membreDelegueId),
      poidsDeclaraKg:       form.poidsDeclaraKg    ? Number(form.poidsDeclaraKg)    : null,
      nombreSacsDeclares:   form.nombreSacsDeclares ? Number(form.nombreSacsDeclares) : null,
      typeTransport:        form.typeTransport,
      vehiculeId:           form.typeTransport === "cooperatif" && form.vehiculeId   ? Number(form.vehiculeId)   : null,
      chauffeurId:          form.typeTransport === "cooperatif" && form.chauffeurId  ? Number(form.chauffeurId)  : null,
      typeVehicule:         form.typeTransport === "externe"    ? form.typeVehicule   : null,
      immatriculation:      form.typeTransport === "externe"    ? form.immatriculation : null,
      nomChauffeur:         form.typeTransport === "externe"    ? form.nomChauffeur    : null,
      telephoneChauffeur:   form.typeTransport === "externe"    ? form.telephoneChauffeur : null,
      fraisCarburantFcfa:   form.fraisCarburantFcfa ? Number(form.fraisCarburantFcfa) : 0,
      autresChargesFcfa:    form.autresChargesFcfa  ? Number(form.autresChargesFcfa)  : 0,
      autresChargesLibelle: form.autresChargesLibelle || null,
      notes:                form.notes || null,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bons-reception"] });
      setShowForm(false);
      setForm(FORM_INIT);
    },
  });

  // ── Mutation annuler ─────────────────────────────────────────────────────
  const mutAnnuler = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/pesee/bons-reception/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bons-reception"] }),
  });

  // ── Totaux ────────────────────────────────────────────────────────────────
  const bonsActifs = bons.filter(b => b.statut === "en_attente_pesee" || b.statut === "en_pesee");
  const fraisTotal = bonsActifs.reduce((s, b) => s + b.fraisCarburantFcfa + b.autresChargesFcfa, 0);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#111", margin: 0 }}>
            Bons de réception — Membres délégués
          </h1>
          <p style={{ fontSize: ".82rem", color: "#6b7280", margin: "4px 0 0" }}>
            Enregistrez l'arrivée du cacao d'un membre délégué de localités avant la pesée.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(FORM_INIT); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)",
            color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px",
            fontWeight: 700, fontSize: ".88rem", cursor: "pointer",
          }}
        >
          <Plus size={16} />
          Nouveau bon de réception
        </button>
      </div>

      {/* ── Synthèse rapide ──────────────────────────────────────────────── */}
      {bonsActifs.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20,
        }}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: ".7rem", color: "#92400e", fontWeight: 600, marginBottom: 4 }}>EN ATTENTE</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#d97706" }}>
              {bonsActifs.filter(b => b.statut === "en_attente_pesee").length}
            </div>
          </div>
          <div style={{ background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: ".7rem", color: "#164e63", fontWeight: 600, marginBottom: 4 }}>PESÉE EN COURS</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0891b2" }}>
              {bonsActifs.filter(b => b.statut === "en_pesee").length}
            </div>
          </div>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: ".7rem", color: "#7f1d1d", fontWeight: 600, marginBottom: 4 }}>FRAIS AVANCÉS</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ef4444" }}>{fmt(fraisTotal)} F</div>
          </div>
        </div>
      )}

      {/* ── Filtres ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { value: "actifs", label: "Actifs" },
          { value: "termines", label: "Terminés" },
          { value: "tous", label: "Tous" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFiltreStatut(f.value)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
              background: filtreStatut === f.value ? "#0891b2" : "#f3f4f6",
              color: filtreStatut === f.value ? "#fff" : "#374151",
              border: "1px solid " + (filtreStatut === f.value ? "#0891b2" : "#e5e7eb"),
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => void refetch()}
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "1px solid #e5e7eb", borderRadius: 8,
            color: "#6b7280", padding: "6px 12px", fontSize: ".78rem", cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
          Actualiser
        </button>
      </div>

      {/* ── Liste des bons ───────────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
          <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <div>Chargement…</div>
        </div>
      )}

      {!isLoading && bons.length === 0 && (
        <div style={{
          background: "#f9fafb", border: "2px dashed #e5e7eb", borderRadius: 16,
          padding: "48px 24px", textAlign: "center",
        }}>
          <Package size={40} color="#d1d5db" style={{ marginBottom: 12 }} />
          <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>Aucun bon de réception</div>
          <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>
            Les bons créés apparaîtront ici.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bons.map(bon => {
          const sc = STATUT_CONF[bon.statut];
          const fraisTotal = bon.fraisCarburantFcfa + bon.autresChargesFcfa;
          return (
            <div key={bon.id} style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
              boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden",
            }}>
              {/* Header carte */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderBottom: "1px solid #f3f4f6",
                background: bon.statut === "en_pesee" ? "#ecfeff" : bon.statut === "terminee" ? "#f0fdf4" : "#fff",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: "#e0f2fe",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {bon.statut === "terminee" ? <CheckCircle2 size={20} color="#16a34a" /> :
                   bon.statut === "en_pesee" ? <Scale size={20} color="#0891b2" /> :
                   <Package size={20} color="#0891b2" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "1rem", color: "#111" }}>
                    {bon.membrePrenoms} {bon.membreNom}
                  </div>
                  <div style={{ fontSize: ".72rem", color: "#6b7280" }}>
                    {bon.membreSection ?? "—"} · Bon #{bon.id} · {fmtDate(bon.createdAt)}
                  </div>
                </div>
                <span style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: ".7rem", fontWeight: 700,
                  color: sc.color, background: sc.bg, border: `1px solid ${sc.color}33`,
                  whiteSpace: "nowrap",
                }}>
                  {sc.label}
                </span>
              </div>

              {/* Corps */}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                  {bon.poidsDeclaraKg != null && (
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: ".65rem", color: "#6b7280", marginBottom: 2 }}>Poids déclaré</div>
                      <div style={{ fontWeight: 700, color: "#15803d", fontSize: "1.1rem" }}>{fmt(bon.poidsDeclaraKg)} kg</div>
                    </div>
                  )}
                  {bon.nombreSacsDeclares != null && (
                    <div style={{ background: "#fffbeb", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: ".65rem", color: "#6b7280", marginBottom: 2 }}>Sacs déclarés</div>
                      <div style={{ fontWeight: 700, color: "#d97706", fontSize: "1.1rem" }}>{bon.nombreSacsDeclares}</div>
                    </div>
                  )}
                  {fraisTotal > 0 && (
                    <div style={{ background: "#fef2f2", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: ".65rem", color: "#6b7280", marginBottom: 2 }}>Frais avancés</div>
                      <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "1.1rem" }}>{fmt(fraisTotal)} F</div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: ".75rem", color: "#6b7280", display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <span>
                    <Truck size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                    {bon.typeTransport === "cooperatif" ? "Camion coopérative" : "Véhicule externe"}
                    {bon.immatriculation ? ` · ${bon.immatriculation}` : ""}
                  </span>
                  {bon.nomChauffeur && <span>Chauffeur : {bon.nomChauffeur}</span>}
                  {bon.fraisCarburantFcfa > 0 && <span>Carburant : {fmt(bon.fraisCarburantFcfa)} F</span>}
                  {bon.autresChargesFcfa > 0 && <span>{bon.autresChargesLibelle ?? "Autres charges"} : {fmt(bon.autresChargesFcfa)} F</span>}
                </div>

                {bon.notes && (
                  <div style={{
                    fontSize: ".73rem", color: "#6b7280", fontStyle: "italic",
                    padding: "6px 10px", background: "#f9fafb", borderRadius: 6,
                    borderLeft: "2px solid #e5e7eb", marginTop: 10,
                  }}>
                    « {bon.notes} »
                  </div>
                )}

                {bon.statut === "en_attente_pesee" && (
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        if (window.confirm(`Annuler le bon de réception #${bon.id} pour ${bon.membrePrenoms} ${bon.membreNom} ?`)) {
                          mutAnnuler.mutate(bon.id);
                        }
                      }}
                      style={{
                        background: "none", border: "1px solid #fca5a5", color: "#ef4444",
                        borderRadius: 8, padding: "6px 14px", fontSize: ".78rem",
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                )}

                {bon.statut === "en_pesee" && bon.sessionPeseeId && (
                  <div style={{ marginTop: 10, fontSize: ".75rem", color: "#0891b2", display: "flex", alignItems: "center", gap: 6 }}>
                    <Scale size={12} />
                    Session de pesée #{bon.sessionPeseeId} en cours
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal : Nouveau bon ──────────────────────────────────────────── */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
          display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px",
          overflowY: "auto",
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)", marginBottom: 24,
          }}>
            {/* Header modal */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid #e5e7eb",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#111" }}>
                  Nouveau bon de réception
                </div>
                <div style={{ fontSize: ".75rem", color: "#6b7280", marginTop: 2 }}>
                  Enregistre l'arrivée du cacao d'un membre délégué de localités
                </div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                <X size={20} />
              </button>
            </div>

            {/* Corps du formulaire */}
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {mutCreer.isError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: ".82rem", color: "#b91c1c", display: "flex", gap: 8 }}>
                  <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  {(mutCreer.error as Error).message}
                </div>
              )}

              {/* Membre délégué */}
              <div>
                <label style={labelStyle}>Membre délégué de localités *</label>
                <select
                  value={form.membreDelegueId}
                  onChange={e => setForm(f => ({ ...f, membreDelegueId: e.target.value }))}
                  style={selectStyle}
                  disabled={isLoadingMembres}
                >
                  <option value="">
                    {isLoadingMembres
                      ? "Chargement des membres…"
                      : isMembresError
                        ? "Impossible de charger les membres"
                        : membres.length === 0
                          ? "Aucun membre délégué disponible"
                          : "— Sélectionner —"}
                  </option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.prenoms} {m.nom}{m.section ? ` (${m.section})` : ""}
                    </option>
                  ))}
                </select>
                {isMembresError ? (
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: ".75rem", color: "#b91c1c" }}>
                    <AlertCircle size={13} />
                    <span>{(membresError as Error).message}</span>
                    <button
                      type="button"
                      onClick={() => void refetchMembres()}
                      style={{ border: "none", background: "none", color: "#0891b2", fontWeight: 700, cursor: "pointer", padding: 0 }}
                    >
                      Réessayer
                    </button>
                  </div>
                ) : !isLoadingMembres && membres.length === 0 ? (
                  <div style={{ marginTop: 6, fontSize: ".75rem", color: "#92400e" }}>
                    Aucun membre actif avec la catégorie « Délégué de localités » n’est disponible.
                  </div>
                ) : null}
              </div>

              {/* Poids + sacs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Poids déclaré (kg)</label>
                  <input type="number" min="0" step="0.1" value={form.poidsDeclaraKg}
                    onChange={e => setForm(f => ({ ...f, poidsDeclaraKg: e.target.value }))}
                    style={inputStyle} placeholder="ex. 2500" />
                </div>
                <div>
                  <label style={labelStyle}>Nombre de sacs déclarés</label>
                  <input type="number" min="0" step="1" value={form.nombreSacsDeclares}
                    onChange={e => setForm(f => ({ ...f, nombreSacsDeclares: e.target.value }))}
                    style={inputStyle} placeholder="ex. 50" />
                </div>
              </div>

              {/* Type de transport */}
              <div>
                <label style={labelStyle}>Type de transport *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["cooperatif", "externe"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, typeTransport: t, vehiculeId: "", chauffeurId: "", typeVehicule: "", immatriculation: "", nomChauffeur: "", telephoneChauffeur: "" }))}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 8, fontWeight: 700, fontSize: ".82rem",
                        cursor: "pointer", border: `2px solid ${form.typeTransport === t ? "#0891b2" : "#e5e7eb"}`,
                        background: form.typeTransport === t ? "#ecfeff" : "#f9fafb",
                        color: form.typeTransport === t ? "#0891b2" : "#374151",
                      }}
                    >
                      {t === "cooperatif" ? "🚛 Camion coopérative" : "🚐 Véhicule externe"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transport coopératif */}
              {form.typeTransport === "cooperatif" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#f0f9ff", borderRadius: 10, padding: "14px" }}>
                  <div>
                    <label style={labelStyle}>Véhicule (flotte coop)</label>
                    <select value={form.vehiculeId} onChange={e => setForm(f => ({ ...f, vehiculeId: e.target.value }))} style={selectStyle}>
                      <option value="">— Sélectionner un véhicule —</option>
                      {vehicules.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.immatriculation}{v.marque ? ` · ${v.marque}` : ""}{v.modele ? ` ${v.modele}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Chauffeur (flotte coop)</label>
                    <select value={form.chauffeurId} onChange={e => setForm(f => ({ ...f, chauffeurId: e.target.value }))} style={selectStyle}>
                      <option value="">— Sélectionner un chauffeur —</option>
                      {chauffeurs.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.prenoms} {c.nom}{c.telephone ? ` · ${c.telephone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Transport externe */}
              {form.typeTransport === "externe" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#fffbeb", borderRadius: 10, padding: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Type de véhicule</label>
                      <select value={form.typeVehicule} onChange={e => setForm(f => ({ ...f, typeVehicule: e.target.value }))} style={selectStyle}>
                        <option value="">— Sélectionner —</option>
                        {TYPE_VEHICULE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Immatriculation</label>
                      <input type="text" value={form.immatriculation}
                        onChange={e => setForm(f => ({ ...f, immatriculation: e.target.value }))}
                        style={inputStyle} placeholder="ex. CI-1234-AB" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Nom du chauffeur</label>
                      <input type="text" value={form.nomChauffeur}
                        onChange={e => setForm(f => ({ ...f, nomChauffeur: e.target.value }))}
                        style={inputStyle} placeholder="Nom complet" />
                    </div>
                    <div>
                      <label style={labelStyle}>Téléphone chauffeur</label>
                      <input type="tel" value={form.telephoneChauffeur}
                        onChange={e => setForm(f => ({ ...f, telephoneChauffeur: e.target.value }))}
                        style={inputStyle} placeholder="07 00 00 00 00" />
                    </div>
                  </div>
                </div>
              )}

              {/* Frais avancés */}
              <div>
                <label style={{ ...labelStyle, marginBottom: 10 }}>Frais avancés par la coopérative (déduits du net membre)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ ...labelStyle, fontWeight: 500, color: "#6b7280" }}>Carburant (F CFA)</label>
                    <input type="number" min="0" step="500" value={form.fraisCarburantFcfa}
                      onChange={e => setForm(f => ({ ...f, fraisCarburantFcfa: e.target.value }))}
                      style={inputStyle} placeholder="0" />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontWeight: 500, color: "#6b7280" }}>Autres charges (F CFA)</label>
                    <input type="number" min="0" step="500" value={form.autresChargesFcfa}
                      onChange={e => setForm(f => ({ ...f, autresChargesFcfa: e.target.value }))}
                      style={inputStyle} placeholder="0" />
                  </div>
                </div>
                {form.autresChargesFcfa && Number(form.autresChargesFcfa) > 0 && (
                  <input type="text" value={form.autresChargesLibelle}
                    onChange={e => setForm(f => ({ ...f, autresChargesLibelle: e.target.value }))}
                    style={{ ...inputStyle, marginTop: 8 }} placeholder="Libellé autres charges (ex. péage, manutention…)" />
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes / observations</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
                  placeholder="Observations particulières…"
                />
              </div>
            </div>

            {/* Pied du modal */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={btnGhostStyle}>
                Annuler
              </button>
              <button
                onClick={() => mutCreer.mutate()}
                disabled={!form.membreDelegueId || mutCreer.isPending}
                style={{
                  ...btnPrimaryStyle,
                  opacity: !form.membreDelegueId || mutCreer.isPending ? 0.5 : 1,
                  cursor: !form.membreDelegueId || mutCreer.isPending ? "not-allowed" : "pointer",
                }}
              >
                {mutCreer.isPending ? "Création…" : "Créer le bon de réception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles utilitaires ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: ".78rem", fontWeight: 700, color: "#374151", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db",
  fontSize: ".88rem", boxSizing: "border-box", outline: "none", background: "#fff",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)",
  color: "#fff", fontWeight: 700, fontSize: ".88rem",
};

const btnGhostStyle: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 10, cursor: "pointer",
  border: "1px solid #e5e7eb", background: "none", color: "#374151",
  fontWeight: 600, fontSize: ".88rem",
};
