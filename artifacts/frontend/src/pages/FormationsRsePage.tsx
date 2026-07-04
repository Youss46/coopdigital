import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Plus, Trash2, BookOpen, Users, Calendar, Clock,
  MapPin, User, Banknote, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";

function getToken() {
  return localStorage.getItem("coop_token") ?? "";
}

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

type FormationRse = {
  id: number;
  titre: string | null;
  thematique: string | null;
  dateFormation: string | null;
  lieu: string | null;
  formateur: string | null;
  nbParticipants: number | null;
  nbFemmes: number | null;
  dureeJours: string | null;
  financement: string | null;
  campagneId: number | null;
};

type Campagne = { id: number; nom: string; };

const THEMATIQUES = [
  "Agriculture durable",
  "Bonnes pratiques agricoles",
  "Gestion financière",
  "Sécurité & santé au travail",
  "Équité genre & inclusion",
  "Biodiversité & environnement",
  "Leadership & gouvernance",
  "Traçabilité & qualité",
  "Autre",
];

const FINANCEMENTS = [
  "Fonds propres",
  "ONG partenaire",
  "Subvention État",
  "Acheteur / client",
  "Certification",
  "Autre",
];

const VIDE: Omit<FormationRse, "id" | "campagneId"> & { campagneId?: number } = {
  titre: "",
  thematique: "",
  dateFormation: "",
  lieu: "",
  formateur: "",
  nbParticipants: null,
  nbFemmes: null,
  dureeJours: null,
  financement: "",
};

export default function FormationsRsePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const peutCreer = usePermission("formations_rse", "creer");

  const [campagneId, setCampagneId] = useState<number | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof VIDE>({ ...VIDE });
  const [delId, setDelId] = useState<number | null>(null);

  const { data: campagnes = [] } = useQuery<Campagne[]>({
    queryKey: ["campagnes"],
    queryFn: () => apiFetch("/api/campagnes"),
  });

  const { data: formations = [], isLoading } = useQuery<FormationRse[]>({
    queryKey: ["formations-rse", campagneId],
    queryFn: () =>
      apiFetch(`/api/formations-rse${campagneId ? `?campagne_id=${campagneId}` : ""}`),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof VIDE) => apiPost("/api/formations-rse", { ...body, campagneId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formations-rse"] });
      setShowForm(false);
      setForm({ ...VIDE });
      toast({ title: "Formation ajoutée" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter la formation", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/formations-rse/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formations-rse"] });
      setDelId(null);
      toast({ title: "Formation supprimée" });
    },
    onError: () => toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" }),
  });

  const totalParticipants = formations.reduce((s, f) => s + (f.nbParticipants ?? 0), 0);
  const totalFemmes = formations.reduce((s, f) => s + (f.nbFemmes ?? 0), 0);
  const totalJours = formations.reduce((s, f) => s + (f.dureeJours ? parseFloat(f.dureeJours) : 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <GraduationCap className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Formations RSE</h1>
            <p className="text-sm text-gray-500">Suivi des formations pour le reporting RSE</p>
          </div>
        </div>
        {peutCreer && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Ajouter une formation
          </button>
        )}
      </div>

      {/* Filtre campagne */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Campagne :</label>
        <select
          value={campagneId ?? ""}
          onChange={(e) => setCampagneId(e.target.value ? parseInt(e.target.value) : undefined)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Toutes les campagnes</option>
          {campagnes.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Formations", value: formations.length, icon: BookOpen, color: "blue" },
          { label: "Participants", value: totalParticipants, icon: Users, color: "indigo" },
          { label: "dont Femmes", value: totalFemmes, icon: User, color: "pink" },
          { label: "Jours de formation", value: totalJours.toFixed(1), icon: Clock, color: "emerald" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg bg-${color}-50 flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 text-${color}-600`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : formations.length === 0 ? (
          <div className="p-12 text-center">
            <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune formation enregistrée</p>
            {peutCreer && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 text-emerald-600 text-sm font-medium hover:underline"
              >
                Ajouter la première formation
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Titre", "Thématique", "Date", "Lieu", "Formateur", "Participants", "Femmes", "Jours", "Financement", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {formations.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-48 truncate">{f.titre ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs">
                        {f.thematique ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(f.dateFormation)}</td>
                    <td className="px-4 py-3 text-gray-600">{f.lieu ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{f.formateur ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-medium">{f.nbParticipants ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-pink-600 font-medium">{f.nbFemmes ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{f.dureeJours ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{f.financement ?? "—"}</td>
                    <td className="px-4 py-3">
                      {peutCreer && (
                        <button
                          onClick={() => setDelId(f.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Modal ajout */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Nouvelle formation RSE</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.titre ?? ""}
                  onChange={(e) => setForm({ ...form, titre: e.target.value })}
                  placeholder="Ex : Formation BPA saison 2024"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thématique</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.thematique ?? ""}
                  onChange={(e) => setForm({ ...form, thematique: e.target.value })}
                >
                  <option value="">— Sélectionner —</option>
                  {THEMATIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.dateFormation ?? ""}
                  onChange={(e) => setForm({ ...form, dateFormation: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.lieu ?? ""}
                  onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                  placeholder="Village, ville…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Formateur / Organisme</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.formateur ?? ""}
                  onChange={(e) => setForm({ ...form, formateur: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nb participants</label>
                <input
                  type="number" min="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.nbParticipants ?? ""}
                  onChange={(e) => setForm({ ...form, nbParticipants: e.target.value ? parseInt(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">dont Femmes</label>
                <input
                  type="number" min="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.nbFemmes ?? ""}
                  onChange={(e) => setForm({ ...form, nbFemmes: e.target.value ? parseInt(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durée (jours)</label>
                <input
                  type="number" min="0" step="0.5"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.dureeJours ?? ""}
                  onChange={(e) => setForm({ ...form, dureeJours: e.target.value || null })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Financement</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.financement ?? ""}
                  onChange={(e) => setForm({ ...form, financement: e.target.value })}
                >
                  <option value="">— Sélectionner —</option>
                  {FINANCEMENTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => { setShowForm(false); setForm({ ...VIDE }); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={!form.titre || createMut.isPending}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {createMut.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {delId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Supprimer cette formation ?</h3>
            <p className="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => deleteMut.mutate(delId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? "…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
