import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { fetchPlans, updatePlan, formatFcfa, type Plan } from "@/lib/api";
import { Loader2, Pencil, Check, X, AlertCircle } from "lucide-react";

const DUREES: { key: keyof Plan; label: string }[] = [
  { key: "prix1anFcfa",  label: "1 an" },
  { key: "prix2ansFcfa", label: "2 ans" },
  { key: "prix3ansFcfa", label: "3 ans" },
  { key: "prix5ansFcfa", label: "5 ans" },
];

type EditState = {
  prix1anFcfa: string; prix2ansFcfa: string;
  prix3ansFcfa: string; prix5ansFcfa: string;
  nbMembresMax: string; nbUsersMax: string;
  stockageGo: string; support: string;
};

function toEditState(p: Plan): EditState {
  return {
    prix1anFcfa:  String(p.prix1anFcfa),
    prix2ansFcfa: String(p.prix2ansFcfa),
    prix3ansFcfa: String(p.prix3ansFcfa),
    prix5ansFcfa: String(p.prix5ansFcfa),
    nbMembresMax: p.nbMembresMax != null ? String(p.nbMembresMax) : "",
    nbUsersMax:   p.nbUsersMax   != null ? String(p.nbUsersMax)   : "",
    stockageGo:   p.stockageGo   != null ? String(p.stockageGo)   : "",
    support:      p.support ?? "",
  };
}

const inputCls = "w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

export default function Plans() {
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft]   = useState<EditState | null>(null);
  const [saving, setSaving]  = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => setError("Impossible de charger les plans"))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(p: Plan) {
    setEditingId(p.id);
    setDraft(toEditState(p));
    setError(""); setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null); setDraft(null);
  }

  async function saveEdit(p: Plan) {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const updated = await updatePlan(p.id, {
        prix1anFcfa:  parseInt(draft.prix1anFcfa)  || 0,
        prix2ansFcfa: parseInt(draft.prix2ansFcfa) || 0,
        prix3ansFcfa: parseInt(draft.prix3ansFcfa) || 0,
        prix5ansFcfa: parseInt(draft.prix5ansFcfa) || 0,
        nbMembresMax: draft.nbMembresMax ? parseInt(draft.nbMembresMax) : null,
        nbUsersMax:   draft.nbUsersMax   ? parseInt(draft.nbUsersMax)   : null,
        stockageGo:   draft.stockageGo   ? parseInt(draft.stockageGo)   : null,
        support:      draft.support || undefined,
      });
      setPlans(prev => prev.map(pl => pl.id === updated.id ? updated : pl));
      setSuccess(`Plan "${p.nom}" mis à jour`);
      setEditingId(null); setDraft(null);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof EditState, value: string) {
    setDraft(d => d ? { ...d, [field]: value } : d);
  }

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Plans d'abonnement</h1>
          <p className="text-muted-foreground text-sm mt-1">Modifier les tarifs et limites de chaque plan</p>
        </div>

        {success && (
          <div className="flex items-center gap-2 mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
            <Check size={15} /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 mb-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-4 py-3 text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map(p => {
              const isEditing = editingId === p.id;
              return (
                <div key={p.id} className="bg-card border rounded-xl overflow-hidden">
                  {/* En-tête du plan */}
                  <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
                    <div>
                      <span className="font-bold text-lg">{p.nom}</span>
                      {!isEditing && (
                        <span className="ml-3 text-sm text-muted-foreground">
                          {p.nbMembresMax ? `${p.nbMembresMax} membres max` : "Membres illimités"}
                          {" · "}
                          {p.stockageGo ?? "—"} Go
                          {" · "}
                          Support {p.support ?? "—"}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(p)}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Enregistrer
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium hover:bg-muted"
                          >
                            <X size={13} /> Annuler
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(p)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium hover:bg-muted"
                        >
                          <Pencil size={13} /> Modifier
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Tarifs */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Tarifs FCFA</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {DUREES.map(({ key, label }) => (
                          <div key={key}>
                            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                            {isEditing && draft ? (
                              <input
                                type="number"
                                value={draft[key as keyof EditState]}
                                onChange={e => set(key as keyof EditState, e.target.value)}
                                className={inputCls}
                                min={0}
                                step={1000}
                              />
                            ) : (
                              <div className="text-sm font-semibold">
                                {formatFcfa(parseInt(String(p[key as keyof Plan] ?? 0)))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Limites */}
                    {isEditing && draft && (
                      <>
                        <div className="border-t pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Limites & options</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Membres max</label>
                              <input type="number" value={draft.nbMembresMax} onChange={e => set("nbMembresMax", e.target.value)}
                                className={inputCls} min={0} placeholder="Illimité" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Utilisateurs max</label>
                              <input type="number" value={draft.nbUsersMax} onChange={e => set("nbUsersMax", e.target.value)}
                                className={inputCls} min={0} placeholder="Illimité" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Stockage (Go)</label>
                              <input type="number" value={draft.stockageGo} onChange={e => set("stockageGo", e.target.value)}
                                className={inputCls} min={0} />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Support</label>
                              <select value={draft.support} onChange={e => set("support", e.target.value)} className={inputCls}>
                                <option value="email">Email</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="prioritaire">Prioritaire</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
