import { useEffect, useState } from "react";
import { AlertTriangle, Fuel, Truck, X } from "lucide-react";
import type { CreateBonReceptionTerrainInput } from "../lib/api";
import type { BonReceptionCreationOptions } from "../lib/types";
import { MoneyInput } from "./ui/money-input";

interface FormState {
  membreDelegueId: string;
  poidsDeclaraKg: string;
  nombreSacsDeclares: string;
  typeTransport: "cooperatif" | "externe";
  vehiculeId: string;
  chauffeurId: string;
  typeVehicule: string;
  immatriculation: string;
  nomChauffeur: string;
  telephoneChauffeur: string;
  fraisCarburantFcfa: string;
  autresChargesFcfa: string;
  autresChargesLibelle: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  membreDelegueId: "",
  poidsDeclaraKg: "",
  nombreSacsDeclares: "",
  typeTransport: "externe",
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

const TYPES_VEHICULE = ["Camion", "Bâché", "Pick-up", "Tricycle", "Autre"];

interface Props {
  open: boolean;
  options: BonReceptionCreationOptions | null;
  loadingOptions: boolean;
  error: string | null;
  submitting: boolean;
  /** Membre déjà sélectionné depuis les parcours Simple ou Groupée. */
  initialMembreDelegueId?: number | null;
  onClose: () => void;
  onRetry: () => void;
  onSubmit: (data: CreateBonReceptionTerrainInput) => void;
}

export default function CreateBonReceptionSheet({
  open,
  options,
  loadingOptions,
  error,
  submitting,
  initialMembreDelegueId,
  onClose,
  onRetry,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_FORM,
        membreDelegueId: initialMembreDelegueId ? String(initialMembreDelegueId) : "",
      });
    }
  }, [open, initialMembreDelegueId]);

  if (!open) return null;

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const transportCooperatif = form.typeTransport === "cooperatif";
  const canSubmit = !!form.membreDelegueId
    && (!transportCooperatif || (!!form.vehiculeId && !!form.chauffeurId))
    && !loadingOptions
    && !submitting;

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      membreDelegueId: Number(form.membreDelegueId),
      poidsDeclaraKg: form.poidsDeclaraKg ? Number(form.poidsDeclaraKg) : null,
      nombreSacsDeclares: form.nombreSacsDeclares ? Number(form.nombreSacsDeclares) : null,
      typeTransport: form.typeTransport,
      vehiculeId: transportCooperatif ? Number(form.vehiculeId) : null,
      chauffeurId: transportCooperatif ? Number(form.chauffeurId) : null,
      typeVehicule: !transportCooperatif ? form.typeVehicule || null : null,
      immatriculation: !transportCooperatif ? form.immatriculation || null : null,
      nomChauffeur: !transportCooperatif ? form.nomChauffeur || null : null,
      telephoneChauffeur: !transportCooperatif ? form.telephoneChauffeur || null : null,
      fraisCarburantFcfa: form.fraisCarburantFcfa ? Number(form.fraisCarburantFcfa) : 0,
      autresChargesFcfa: form.autresChargesFcfa ? Number(form.autresChargesFcfa) : 0,
      autresChargesLibelle: form.autresChargesLibelle || null,
      notes: form.notes || null,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-bon-title"
      onClick={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        display: "flex", alignItems: "flex-end",
        background: "rgba(15, 23, 42, .52)",
      }}
    >
      <div style={{
        width: "100%", maxHeight: "92vh", overflowY: "auto",
        background: "var(--t-card)", borderRadius: "22px 22px 0 0",
        padding: "12px 16px max(24px, env(safe-area-inset-bottom))",
        boxShadow: "0 -12px 32px rgba(0,0,0,.18)",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "var(--t-border)", margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--t-warning-bg)", color: "var(--t-warning)", display: "grid", placeItems: "center" }}>
            <Truck size={21} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 id="create-bon-title" style={{ margin: 0, fontSize: "1.05rem", color: "var(--t-text)" }}>Nouveau bon de réception</h2>
            <p style={{ margin: "3px 0 0", fontSize: ".76rem", lineHeight: 1.4, color: "var(--t-muted)" }}>
              Enregistrez l’arrivée avant de démarrer la pesée.
            </p>
          </div>
          <button aria-label="Fermer" disabled={submitting} onClick={onClose} style={closeButtonStyle}><X size={20} /></button>
        </div>

        {error && (
          <div style={errorStyle}>
            <AlertTriangle size={17} />
            <span style={{ flex: 1 }}>{error}</span>
            {loadingOptions === false && !options && <button onClick={onRetry} style={retryStyle}>Réessayer</button>}
          </div>
        )}

        {loadingOptions && (
          <div style={{ padding: "42px 0", textAlign: "center", color: "var(--t-muted)", fontSize: ".84rem" }}>
            <div className="t-spinner" style={{ margin: "0 auto 12px" }} />
            Chargement des informations…
          </div>
        )}

        {!loadingOptions && options && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Membre délégué de localités *</label>
              <select value={form.membreDelegueId} onChange={(e) => update({ membreDelegueId: e.target.value })} style={fieldStyle}>
                <option value="">— Sélectionner le membre —</option>
                {options.membres.map((membre) => (
                  <option key={membre.id} value={membre.id}>
                    {membre.prenoms} {membre.nom}{membre.section ? ` · ${membre.section}` : ""}
                  </option>
                ))}
              </select>
              {options.membres.length === 0 && <p style={hintStyle}>Aucun membre délégué actif n’est disponible.</p>}
            </div>

            <div style={twoColumnsStyle}>
              <div>
                <label style={labelStyle}>Poids déclaré (kg)</label>
                <input type="number" min="0" step="0.1" inputMode="decimal" value={form.poidsDeclaraKg} onChange={(e) => update({ poidsDeclaraKg: e.target.value })} placeholder="Ex. 2 500" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sacs déclarés</label>
                <input type="number" min="0" step="1" inputMode="numeric" value={form.nombreSacsDeclares} onChange={(e) => update({ nombreSacsDeclares: e.target.value })} placeholder="Ex. 50" style={fieldStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Transport *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                {(["externe", "cooperatif"] as const).map((type) => {
                  const active = form.typeTransport === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update({ typeTransport: type, vehiculeId: "", chauffeurId: "" })}
                      style={{
                        minHeight: 48, borderRadius: 11, cursor: "pointer", fontWeight: 750, fontSize: ".78rem",
                        border: `2px solid ${active ? "var(--t-peseur)" : "var(--t-border)"}`,
                        background: active ? "var(--t-peseur-bg)" : "var(--t-bg)",
                        color: active ? "var(--t-peseur-dark)" : "var(--t-text)",
                      }}
                    >
                      {type === "externe" ? "Véhicule externe" : "Camion coopérative"}
                    </button>
                  );
                })}
              </div>
            </div>

            {transportCooperatif ? (
              <div style={sectionStyle}>
                <div>
                  <label style={labelStyle}>Véhicule de la coopérative *</label>
                  <select value={form.vehiculeId} onChange={(e) => update({ vehiculeId: e.target.value })} style={fieldStyle}>
                    <option value="">— Sélectionner —</option>
                    {options.vehicules.map((vehicule) => <option key={vehicule.id} value={vehicule.id}>{vehicule.immatriculation}{vehicule.marque ? ` · ${vehicule.marque}` : ""}{vehicule.modele ? ` ${vehicule.modele}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Chauffeur de la coopérative *</label>
                  <select value={form.chauffeurId} onChange={(e) => update({ chauffeurId: e.target.value })} style={fieldStyle}>
                    <option value="">— Sélectionner —</option>
                    {options.chauffeurs.map((chauffeur) => <option key={chauffeur.id} value={chauffeur.id}>{chauffeur.prenoms} {chauffeur.nom}{chauffeur.telephone ? ` · ${chauffeur.telephone}` : ""}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div style={sectionStyle}>
                <div style={twoColumnsStyle}>
                  <div>
                    <label style={labelStyle}>Type de véhicule</label>
                    <select value={form.typeVehicule} onChange={(e) => update({ typeVehicule: e.target.value })} style={fieldStyle}>
                      <option value="">— Facultatif —</option>
                      {TYPES_VEHICULE.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Immatriculation</label>
                    <input value={form.immatriculation} onChange={(e) => update({ immatriculation: e.target.value })} placeholder="CI-1234-AB" style={fieldStyle} />
                  </div>
                </div>
                <div style={twoColumnsStyle}>
                  <div>
                    <label style={labelStyle}>Nom du chauffeur</label>
                    <input value={form.nomChauffeur} onChange={(e) => update({ nomChauffeur: e.target.value })} placeholder="Nom complet" style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Téléphone chauffeur</label>
                    <input type="tel" value={form.telephoneChauffeur} onChange={(e) => update({ telephoneChauffeur: e.target.value })} placeholder="07 00 00 00 00" style={fieldStyle} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: "var(--t-warning-bg)", border: "1px solid rgba(217,119,6,.18)", borderRadius: 12, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".8rem", fontWeight: 800, color: "#92400e", marginBottom: 10 }}>
                <Fuel size={16} /> Frais avancés par la coopérative
              </div>
              <div style={twoColumnsStyle}>
                <div>
                  <label style={labelStyle}>Carburant (F CFA)</label>
                  <MoneyInput
                    value={form.fraisCarburantFcfa}
                    onChange={(value) => update({ fraisCarburantFcfa: value })}
                    min="0"
                    step="500"
                    placeholder="0"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Autres charges (F CFA)</label>
                  <MoneyInput
                    value={form.autresChargesFcfa}
                    onChange={(value) => update({ autresChargesFcfa: value })}
                    min="0"
                    step="500"
                    placeholder="0"
                    style={fieldStyle}
                  />
                </div>
              </div>
              {Number(form.autresChargesFcfa) > 0 && (
                <input value={form.autresChargesLibelle} onChange={(e) => update({ autresChargesLibelle: e.target.value })} placeholder="Précisez les autres charges" style={{ ...fieldStyle, marginTop: 10 }} />
              )}
              <p style={{ ...hintStyle, color: "#92400e", marginBottom: 0 }}>Ces montants restent une créance à déduire du règlement du membre.</p>
            </div>

            <div>
              <label style={labelStyle}>Observations</label>
              <textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Informations utiles à la pesée…" style={{ ...fieldStyle, minHeight: 74, resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 2 }}>
              <button onClick={onClose} disabled={submitting} className="t-btn t-btn--ghost" style={{ flex: 1, height: 50 }}>Annuler</button>
              <button onClick={submit} disabled={!canSubmit} className="t-btn t-btn--primary" style={{ flex: 1.35, height: 50, opacity: canSubmit ? 1 : .55, cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {submitting ? "Création…" : "Créer et peser"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", marginBottom: 6, fontSize: ".73rem", color: "var(--t-muted)", fontWeight: 750 } as const;
const fieldStyle = { width: "100%", minHeight: 45, boxSizing: "border-box" as const, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--t-border)", color: "var(--t-text)", background: "var(--t-card)", fontSize: ".86rem", outline: "none" } as const;
const twoColumnsStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
const sectionStyle = { display: "flex", flexDirection: "column" as const, gap: 10, padding: 12, borderRadius: 12, background: "var(--t-bg)", border: "1px solid var(--t-border)" } as const;
const hintStyle = { margin: "6px 0 0", fontSize: ".71rem", lineHeight: 1.4, color: "var(--t-muted)" } as const;
const errorStyle = { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 14, borderRadius: 10, background: "var(--t-danger-bg)", color: "var(--t-danger)", fontSize: ".78rem" } as const;
const closeButtonStyle = { border: "none", background: "transparent", color: "var(--t-muted)", padding: 5, cursor: "pointer" } as const;
const retryStyle = { border: "none", background: "transparent", color: "var(--t-peseur)", fontWeight: 800, cursor: "pointer", padding: 0 } as const;