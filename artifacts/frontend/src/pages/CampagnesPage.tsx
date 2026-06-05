import { useState } from "react";
import {
  CalendarDays, Plus, CheckCircle2, Clock, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  useListCampagnes,
  useGetCampagneActive,
  useCreateCampagne,
  useFermerCampagne,
  type Campagne,
  type CampagneInput,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN_CLS =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors";

function StatutBadge({ statut }: { statut: string }) {
  return statut === "ouverte" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <CheckCircle2 className="w-3 h-3" /> Ouverte
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <Clock className="w-3 h-3" /> Fermée
    </span>
  );
}

function CampagneCard({ campagne, onFermer, peutFermer }: {
  campagne: Campagne;
  onFermer: (id: number) => void;
  peutFermer: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${campagne.statut === "ouverte" ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-gray-900">{campagne.libelle}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {campagne.anneeDebut}–{campagne.anneeFin}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Ouverture : {new Date(campagne.dateOuverture).toLocaleDateString("fr-FR")}
            {campagne.dateFermeture && (
              <> · Clôture : {new Date(campagne.dateFermeture).toLocaleDateString("fr-FR")}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatutBadge statut={campagne.statut} />
          {campagne.statut === "ouverte" && peutFermer && (
            <button
              onClick={() => onFermer(campagne.id)}
              className={`${BTN_CLS} bg-red-50 text-red-700 hover:bg-red-100 text-xs px-3 py-1.5`}
            >
              Clôturer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampagnesPage() {
  const { toast } = useToast();
  const peutCreer = usePermission("campagnes", "creer");
  const peutFermer = usePermission("campagnes", "fermer");

  const { data: campagnes, isLoading } = useListCampagnes();
  const { data: active } = useGetCampagneActive();
  const createMut = useCreateCampagne();
  const fermerMut = useFermerCampagne();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CampagneInput>>({
    dateOuverture: new Date().toISOString().slice(0, 10),
    anneeDebut: new Date().getFullYear(),
    anneeFin: new Date().getFullYear() + 1,
  });

  function handleField<K extends keyof CampagneInput>(k: K, v: CampagneInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.libelle || !form.anneeDebut || !form.anneeFin || !form.dateOuverture) return;
    try {
      await createMut.mutateAsync({
        data: form as CampagneInput,
      });
      toast({ title: "Campagne créée avec succès" });
      setShowForm(false);
      setForm({
        dateOuverture: new Date().toISOString().slice(0, 10),
        anneeDebut: new Date().getFullYear(),
        anneeFin: new Date().getFullYear() + 1,
      });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  }

  async function handleFermer(id: number) {
    if (!confirm("Confirmer la clôture de cette campagne ?")) return;
    try {
      await fermerMut.mutateAsync({ id, data: { dateFermeture: new Date().toISOString().slice(0, 10) } });
      toast({ title: "Campagne clôturée" });
    } catch {
      toast({ title: "Erreur lors de la clôture", variant: "destructive" });
    }
  }

  const ouvertes = campagnes?.filter((c) => c.statut === "ouverte") ?? [];
  const fermees = campagnes?.filter((c) => c.statut === "fermee") ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Campagnes</h1>
            <p className="text-sm text-gray-500">Gestion des campagnes agricoles</p>
          </div>
        </div>
        {peutCreer && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700`}
          >
            <Plus className="w-4 h-4" />
            Nouvelle campagne
            {showForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Campagne active */}
      {active && (
        <div className="bg-green-600 rounded-xl p-4 text-white">
          <div className="text-xs font-medium opacity-80 mb-1">Campagne en cours</div>
          <div className="text-lg font-bold">{active.libelle}</div>
          <div className="text-sm opacity-90">{active.anneeDebut}–{active.anneeFin}</div>
        </div>
      )}

      {/* Formulaire création */}
      {showForm && peutCreer && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="font-semibold text-gray-900">Nouvelle campagne</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
              <input
                className={INPUT_CLS}
                placeholder="Ex: Campagne 2025-2026"
                value={form.libelle ?? ""}
                onChange={(e) => handleField("libelle", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Année début *</label>
              <input
                type="number"
                className={INPUT_CLS}
                value={form.anneeDebut ?? ""}
                onChange={(e) => handleField("anneeDebut", parseInt(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Année fin *</label>
              <input
                type="number"
                className={INPUT_CLS}
                value={form.anneeFin ?? ""}
                onChange={(e) => handleField("anneeFin", parseInt(e.target.value))}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date d'ouverture *</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.dateOuverture ?? ""}
                onChange={(e) => handleField("dateOuverture", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className={`${BTN_CLS} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              Annuler
            </button>
            <button type="submit" disabled={createMut.isPending} className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}>
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer
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
        <div className="space-y-4">
          {ouvertes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">En cours</h3>
              {ouvertes.map((c) => (
                <CampagneCard key={c.id} campagne={c} onFermer={handleFermer} peutFermer={peutFermer} />
              ))}
            </div>
          )}
          {fermees.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Historique</h3>
              {fermees.map((c) => (
                <CampagneCard key={c.id} campagne={c} onFermer={handleFermer} peutFermer={peutFermer} />
              ))}
            </div>
          )}
          {!campagnes?.length && (
            <div className="text-center py-12 text-gray-400">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Aucune campagne enregistrée
            </div>
          )}
        </div>
      )}
    </div>
  );
}
