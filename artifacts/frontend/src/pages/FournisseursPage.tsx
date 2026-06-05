import { useState } from "react";
import {
  UserCheck, Plus, Search, Loader2, Phone, MapPin,
  ChevronDown, ChevronUp, Filter,
} from "lucide-react";
import {
  useListFournisseurs,
  useCreateFournisseur,
  useUpdateFournisseur,
  ListFournisseursType,
  type Fournisseur,
  type FournisseurInput,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN_CLS =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors";

const TYPE_LABELS: Record<string, string> = {
  membre: "Membre", pisteur: "Pisteur", externe: "Externe",
};
const TYPE_COLORS: Record<string, string> = {
  membre: "bg-blue-100 text-blue-700",
  pisteur: "bg-amber-100 text-amber-700",
  externe: "bg-purple-100 text-purple-700",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600"}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function FournisseurCard({ f, onEdit }: { f: Fournisseur; onEdit: (f: Fournisseur) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeBadge type={f.typeFournisseur} />
          <span className="text-xs text-gray-400 font-mono">{f.code}</span>
        </div>
        <div className="font-semibold text-gray-900 text-sm">
          {f.prenoms} {f.nom}
        </div>
        <div className="flex flex-wrap gap-3 mt-1">
          {f.telephone && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Phone className="w-3 h-3" /> {f.telephone}
            </span>
          )}
          {f.section && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {f.section}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onEdit(f)}
        className="text-xs text-gray-400 hover:text-green-600 px-2 py-1"
      >
        Modifier
      </button>
    </div>
  );
}

const FORM_VIDE: Partial<FournisseurInput> = {
  typeFournisseur: "pisteur",
  nationalite: "Ivoirienne",
};

export default function FournisseursPage() {
  const { toast } = useToast();
  const peutCreer = usePermission("fournisseurs", "creer");

  const [filtreType, setFiltreType] = useState<string>("");
  const [recherche, setRecherche] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState<Partial<FournisseurInput>>(FORM_VIDE);

  const { data: fournisseurs, isLoading } = useListFournisseurs({
    type: (filtreType as ListFournisseursType) || undefined,
    q: recherche || undefined,
  });

  const createMut = useCreateFournisseur();
  const updateMut = useUpdateFournisseur();

  function openCreate() {
    setEditTarget(null);
    setForm(FORM_VIDE);
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

  function handleField<K extends keyof FournisseurInput>(k: K, v: FournisseurInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom) return;

    try {
      if (editTarget) {
        await updateMut.mutateAsync({ id: editTarget.id, data: form as FournisseurInput });
        toast({ title: "Fournisseur mis à jour" });
      } else {
        if (!form.typeFournisseur) return;
        await createMut.mutateAsync({ data: form as FournisseurInput });
        toast({ title: "Fournisseur créé avec succès" });
      }
      setShowForm(false);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  }

  const grouped = {
    pisteur: fournisseurs?.filter((f) => f.typeFournisseur === "pisteur") ?? [],
    externe: fournisseurs?.filter((f) => f.typeFournisseur === "externe") ?? [],
    membre: fournisseurs?.filter((f) => f.typeFournisseur === "membre") ?? [],
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fournisseurs</h1>
            <p className="text-sm text-gray-500">Pisteurs & fournisseurs occasionnels</p>
          </div>
        </div>
        {peutCreer && (
          <button onClick={openCreate} className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700`}>
            <Plus className="w-4 h-4" /> Nouveau
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            placeholder="Rechercher…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value)}
        >
          <option value="">Tous types</option>
          <option value="pisteur">Pisteurs</option>
          <option value="externe">Externes</option>
          <option value="membre">Membres</option>
        </select>
      </div>

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="font-semibold text-gray-900">
            {editTarget ? "Modifier le fournisseur" : "Nouveau fournisseur"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {!editTarget && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
                <select
                  className={INPUT_CLS}
                  value={form.typeFournisseur ?? "pisteur"}
                  onChange={(e) => handleField("typeFournisseur", e.target.value as "pisteur" | "externe")}
                  required
                >
                  <option value="pisteur">Pisteur</option>
                  <option value="externe">Externe</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input className={INPUT_CLS} value={form.nom ?? ""} onChange={(e) => handleField("nom", e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prénoms</label>
              <input className={INPUT_CLS} value={form.prenoms ?? ""} onChange={(e) => handleField("prenoms", e.target.value)} />
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
              <input className={INPUT_CLS} value={form.telephone ?? ""} onChange={(e) => handleField("telephone", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
              <input className={INPUT_CLS} value={form.section ?? ""} onChange={(e) => handleField("section", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nationalité</label>
              <input className={INPUT_CLS} value={form.nationalite ?? "Ivoirienne"} onChange={(e) => handleField("nationalite", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N° CNI</label>
              <input className={INPUT_CLS} value={form.numeroCni ?? ""} onChange={(e) => handleField("numeroCni", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origine</label>
              <input className={INPUT_CLS} value={form.origine ?? ""} onChange={(e) => handleField("origine", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className={`${BTN_CLS} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              Annuler
            </button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}>
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editTarget ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="space-y-5">
          {!filtreType || filtreType === "pisteur" ? (
            grouped.pisteur.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
                  Pisteurs ({grouped.pisteur.length})
                </h3>
                <div className="space-y-2">
                  {grouped.pisteur.map((f) => <FournisseurCard key={f.id} f={f} onEdit={openEdit} />)}
                </div>
              </div>
            )
          ) : null}
          {!filtreType || filtreType === "externe" ? (
            grouped.externe.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
                  Fournisseurs externes ({grouped.externe.length})
                </h3>
                <div className="space-y-2">
                  {grouped.externe.map((f) => <FournisseurCard key={f.id} f={f} onEdit={openEdit} />)}
                </div>
              </div>
            )
          ) : null}
          {!filtreType || filtreType === "membre" ? (
            grouped.membre.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
                  Membres ({grouped.membre.length})
                </h3>
                <div className="space-y-2">
                  {grouped.membre.map((f) => <FournisseurCard key={f.id} f={f} onEdit={openEdit} />)}
                </div>
              </div>
            )
          ) : null}
          {!fournisseurs?.length && (
            <div className="text-center py-12 text-gray-400">
              <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Aucun fournisseur enregistré
            </div>
          )}
        </div>
      )}
    </div>
  );
}
