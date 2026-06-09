import { useState } from "react";
import { useLocation } from "wouter";
import {
  UserCheck, Plus, Search, Loader2, Phone, MapPin,
  Users, AlertTriangle, CheckCircle, Clock, Package,
  Eye, Pencil, ShieldCheck, ShieldOff, X, ExternalLink,
} from "lucide-react";
import {
  useListFournisseurs,
  useCreateFournisseur,
  useUpdateFournisseur,
  useUpdateAgrement,
  type Fournisseur,
  type FournisseurInput,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN_PRIMARY =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors";

type Onglet = "pisteurs" | "externes" | "membres";

const STATUT_AGREMENT: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  agree:    { label: "Agréé",    cls: "bg-green-100 text-green-700",  icon: ShieldCheck },
  suspendu: { label: "Suspendu", cls: "bg-red-100 text-red-700",      icon: ShieldOff   },
  expire:   { label: "Expiré",   cls: "bg-gray-100 text-gray-500",    icon: Clock       },
};

function StatutAgrementBadge({ statut }: { statut: string | null | undefined }) {
  const s = STATUT_AGREMENT[statut ?? ""] ?? STATUT_AGREMENT["agree"]!;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

const FORM_VIDE_PISTEUR: Partial<FournisseurInput> = { typeFournisseur: "pisteur", nationalite: "Ivoirienne" };
const FORM_VIDE_EXTERNE: Partial<FournisseurInput> = { typeFournisseur: "externe", nationalite: "Ivoirienne" };

export default function FournisseursPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const peutCreer   = usePermission("fournisseurs", "creer");
  const peutModif   = usePermission("fournisseurs", "modifier");

  const [onglet, setOnglet]           = useState<Onglet>("pisteurs");
  const [recherche, setRecherche]     = useState("");
  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState<Fournisseur | null>(null);
  const [form, setForm]               = useState<Partial<FournisseurInput>>(FORM_VIDE_PISTEUR);
  const [showAgrModal, setShowAgrModal] = useState<Fournisseur | null>(null);
  const [agrForm, setAgrForm]         = useState<{ statut: string; dateAgrement: string; dateExpiration: string }>({
    statut: "agree", dateAgrement: "", dateExpiration: "",
  });

  const { data: fournisseurs = [], isLoading } = useListFournisseurs({
    q: recherche || undefined,
  });

  const createMut   = useCreateFournisseur();
  const updateMut   = useUpdateFournisseur();
  const agrementMut = useUpdateAgrement();

  const pisteurs = fournisseurs.filter((f) => f.typeFournisseur === "pisteur");
  const externes = fournisseurs.filter((f) => f.typeFournisseur === "externe");
  const membres  = fournisseurs.filter((f) => f.typeFournisseur === "membre");

  function openCreate() {
    setEditTarget(null);
    setForm(onglet === "externes" ? FORM_VIDE_EXTERNE : FORM_VIDE_PISTEUR);
    setShowForm(true);
  }

  function openEdit(f: Fournisseur) {
    setEditTarget(f);
    setForm({
      typeFournisseur: f.typeFournisseur as "pisteur" | "externe",
      nom: f.nom,
      prenoms: f.prenoms ?? "",
      sexe: f.sexe ?? "",
      telephone: f.telephone ?? "",
      section: f.section ?? "",
      nationalite: f.nationalite ?? "Ivoirienne",
      numeroCni: f.numeroCni ?? "",
      origine: f.origine ?? "",
    });
    setShowForm(true);
  }

  function openAgrModal(f: Fournisseur) {
    setShowAgrModal(f);
    setAgrForm({
      statut: f.statutAgrement ?? "agree",
      dateAgrement: f.dateAgrement ?? "",
      dateExpiration: f.dateExpirationAgrement ?? "",
    });
  }

  function handleField<K extends keyof FournisseurInput>(k: K, v: FournisseurInput[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom) return;
    try {
      if (editTarget) {
        await updateMut.mutateAsync({ id: editTarget.id, data: form as FournisseurInput });
        toast({ title: "Fournisseur mis à jour" });
      } else {
        await createMut.mutateAsync({ data: form as FournisseurInput });
        toast({ title: "Fournisseur créé" });
      }
      setShowForm(false);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  }

  async function handleAgrementSave() {
    if (!showAgrModal) return;
    try {
      await agrementMut.mutateAsync({
        id: showAgrModal.id,
        data: {
          statutAgrement: agrForm.statut as "agree" | "suspendu" | "expire",
          ...(agrForm.dateAgrement ? { dateAgrement: agrForm.dateAgrement } : {}),
          ...(agrForm.dateExpiration ? { dateExpirationAgrement: agrForm.dateExpiration } : {}),
        },
      });
      toast({ title: "Agrément mis à jour" });
      setShowAgrModal(null);
    } catch {
      toast({ title: "Erreur agrément", variant: "destructive" });
    }
  }

  const onglets: { id: Onglet; label: string; count: number; icon: React.ElementType; color: string }[] = [
    { id: "pisteurs", label: "Pisteurs agréés",         count: pisteurs.length, icon: ShieldCheck, color: "text-amber-600" },
    { id: "externes", label: "Externes occasionnels",   count: externes.length, icon: UserCheck,   color: "text-purple-600" },
    { id: "membres",  label: "Membres coopérateurs",    count: membres.length,  icon: Users,       color: "text-green-700"  },
  ];

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestion des fournisseurs de cacao</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-48 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 bg-white"
              placeholder="Rechercher…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          {peutCreer && onglet !== "membres" && (
            <button onClick={openCreate} className={BTN_PRIMARY}>
              <Plus className="w-4 h-4" />
              Nouveau {onglet === "pisteurs" ? "pisteur" : "fournisseur"}
            </button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {onglets.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => { setOnglet(o.id); setShowForm(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                onglet === o.id
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className={`w-4 h-4 ${onglet === o.id ? o.color : ""}`} />
              {o.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${onglet === o.id ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {o.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Formulaire inline */}
      {showForm && onglet !== "membres" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {editTarget ? "Modifier" : onglet === "pisteurs" ? "Nouveau pisteur agréé" : "Nouveau fournisseur externe"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input className={INPUT_CLS} value={form.nom ?? ""} onChange={(e) => handleField("nom", e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prénoms</label>
              <input className={INPUT_CLS} value={form.prenoms ?? ""} onChange={(e) => handleField("prenoms", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
              <input className={INPUT_CLS} value={form.telephone ?? ""} onChange={(e) => handleField("telephone", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section / Zone</label>
              <input className={INPUT_CLS} value={form.section ?? ""} onChange={(e) => handleField("section", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Village d'origine</label>
              <input className={INPUT_CLS} value={form.origine ?? ""} onChange={(e) => handleField("origine", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sexe</label>
              <select className={INPUT_CLS} value={form.sexe ?? ""} onChange={(e) => handleField("sexe", e.target.value)}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N° CNI</label>
              <input className={INPUT_CLS} value={form.numeroCni ?? ""} onChange={(e) => handleField("numeroCni", e.target.value)} />
            </div>
            {onglet === "pisteurs" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date agrément</label>
                <input type="date" className={INPUT_CLS} value={form.dateAgrement ?? ""} onChange={(e) => handleField("dateAgrement", e.target.value)} />
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className={BTN_SECONDARY}>Annuler</button>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className={BTN_PRIMARY}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editTarget ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contenu des onglets */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : (
        <>
          {/* ── Onglet Pisteurs ── */}
          {onglet === "pisteurs" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              {pisteurs.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  message="Aucun pisteur enregistré"
                  action={peutCreer ? <button onClick={openCreate} className={BTN_PRIMARY}><Plus className="w-4 h-4" />Nouveau pisteur</button> : undefined}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Pisteur</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Téléphone</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Section</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Agrément</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Livraisons</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Tonnage</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pisteurs.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{f.prenoms} {f.nom}</div>
                          <div className="text-xs text-amber-600 font-mono font-semibold mt-0.5">{f.code}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                          {f.telephone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{f.telephone}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                          {f.section ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{f.section}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatutAgrementBadge statut={f.statutAgrement} />
                          {f.dateExpirationAgrement && (
                            <div className="text-xs text-gray-400 mt-0.5">exp. {new Date(f.dateExpirationAgrement).toLocaleDateString("fr-FR")}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                          {(f.nbLivraisons ?? 0) > 0 ? fmt(f.nbLivraisons ?? 0) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                          {(f.tonnageTotal ?? 0) > 0 ? `${((f.tonnageTotal ?? 0) / 1000).toFixed(2)} T` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {peutModif && (
                              <>
                                <button
                                  onClick={() => openAgrModal(f)}
                                  className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                                  title="Gérer l'agrément"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openEdit(f)}
                                  className="p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                                  title="Modifier"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Onglet Externes ── */}
          {onglet === "externes" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              {externes.length === 0 ? (
                <EmptyState
                  icon={UserCheck}
                  message="Aucun fournisseur externe enregistré"
                  action={peutCreer ? <button onClick={openCreate} className={BTN_PRIMARY}><Plus className="w-4 h-4" />Nouveau externe</button> : undefined}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Fournisseur</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Téléphone</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Village</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Livraisons</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Tonnage</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Dernière livraison</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {externes.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{f.prenoms} {f.nom}</div>
                          <div className="text-xs text-purple-600 font-mono font-semibold mt-0.5">{f.code}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                          {f.telephone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{f.telephone}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                          {f.origine ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{f.origine}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                          {(f.nbLivraisons ?? 0) > 0 ? fmt(f.nbLivraisons ?? 0) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                          {(f.tonnageTotal ?? 0) > 0 ? `${((f.tonnageTotal ?? 0) / 1000).toFixed(2)} T` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                          {f.derniereLivraison ? new Date(f.derniereLivraison).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {peutModif && (
                              <button
                                onClick={() => openEdit(f)}
                                className="p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                                title="Modifier"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Onglet Membres ── */}
          {onglet === "membres" && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-green-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900">Membres coopérateurs</h3>
                  <p className="text-sm text-green-700 mt-0.5">
                    Les membres sont les coopérateurs inscrits. Chaque membre est automatiquement enregistré comme fournisseur lors de son inscription.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-green-800">
                    <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Fiche complète + QR code</span>
                    <span className="flex items-center gap-1.5"><Package className="w-4 h-4" /> Avances & intrants</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Parcelle GPS + EUDR</span>
                  </div>
                  <button
                    onClick={() => navigate("/membres")}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Gérer les membres
                  </button>
                </div>
              </div>

              {membres.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Membre</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Téléphone</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Livraisons</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Tonnage</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Fiche</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {membres.map((f) => (
                        <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{f.prenoms} {f.nom}</div>
                            <div className="text-xs text-green-700 font-mono font-semibold mt-0.5">{f.code}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                            {f.telephone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{f.telephone}</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                            {(f.nbLivraisons ?? 0) > 0 ? fmt(f.nbLivraisons ?? 0) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                            {(f.tonnageTotal ?? 0) > 0 ? `${((f.tonnageTotal ?? 0) / 1000).toFixed(2)} T` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {f.membreId && (
                              <button
                                onClick={() => navigate(`/membres/${f.membreId}`)}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                <Eye className="w-3 h-3" />
                                Voir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal agrément pisteur */}
      {showAgrModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Gérer l'agrément</h3>
              <button onClick={() => setShowAgrModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <span className="font-medium">{showAgrModal.prenoms} {showAgrModal.nom}</span>
                <span className="text-xs text-gray-400 font-mono">{showAgrModal.code}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Statut agrément</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["agree", "suspendu", "expire"] as const).map((s) => {
                    const info = STATUT_AGREMENT[s]!;
                    const Icon = info.icon;
                    return (
                      <button
                        key={s}
                        onClick={() => setAgrForm((p) => ({ ...p, statut: s }))}
                        className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 text-xs font-medium transition-colors ${
                          agrForm.statut === s
                            ? `border-current ${info.cls}`
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {agrForm.statut === "suspendu" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">La collecte sera bloquée pour ce pisteur tant que son agrément est suspendu.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date agrément</label>
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={agrForm.dateAgrement}
                    onChange={(e) => setAgrForm((p) => ({ ...p, dateAgrement: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date expiration</label>
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={agrForm.dateExpiration}
                    onChange={(e) => setAgrForm((p) => ({ ...p, dateExpiration: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAgrModal(null)} className={BTN_SECONDARY}>Annuler</button>
              <button onClick={handleAgrementSave} disabled={agrementMut.isPending} className={BTN_PRIMARY}>
                {agrementMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message, action }: { icon: React.ElementType; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
      <Icon className="w-12 h-12 opacity-20" />
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}
