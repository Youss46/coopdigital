import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMembres,
  useCreateMembre,
  type MembreInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMembresQueryKey } from "@workspace/api-client-react";
import { UserPlus, Search, Eye, FileDown, Loader2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const COOP_ID_PAR_DEFAUT = 1;

export default function Membres() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const peutCreer = usePermission("membres", "creer");
  const peutExporter = usePermission("membres", "exporter");
  const [exportPending, setExportPending] = useState(false);

  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<"" | "actif" | "inactif">("");
  const [modalOuvert, setModalOuvert] = useState(false);

  async function handleExportPdf() {
    setExportPending(true);
    try {
      const params = statut ? `?statut=${statut}` : "";
      const token = localStorage.getItem("coop_token") ?? "";
      const res = await fetch(`/api/membres/export-pdf${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur export");
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("PDF vide");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `membres-${statut || "tous"}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch {
      alert("Impossible de générer le PDF");
    } finally {
      setExportPending(false);
    }
  }

  const { data, isLoading } = useGetMembres({
    search: recherche || undefined,
    statut: statut || undefined,
    limit: 50,
  });

  const membres = data?.membres ?? [];

  const mutation = useCreateMembre({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMembresQueryKey() });
        setModalOuvert(false);
        resetForm();
      },
    },
  });

  const [form, setForm] = useState<Partial<MembreInput>>({
    cooperativeId: COOP_ID_PAR_DEFAUT,
    statut: "actif",
    dateAdhesion: new Date().toISOString().split("T")[0],
  });

  const resetForm = () =>
    setForm({ cooperativeId: COOP_ID_PAR_DEFAUT, statut: "actif", dateAdhesion: new Date().toISOString().split("T")[0] });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.prenoms || !form.telephone || !form.superficieHa) return;
    mutation.mutate({
      data: {
        cooperativeId: COOP_ID_PAR_DEFAUT,
        nom: form.nom!,
        prenoms: form.prenoms!,
        telephone: form.telephone!,
        superficieHa: String(form.superficieHa),
        dateAdhesion: form.dateAdhesion!,
        statut: form.statut as "actif" | "inactif",
        village: form.village,
        groupement: form.groupement,
        numeroCni: form.numeroCni,
        sexe: form.sexe,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membres</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total ?? 0} membres enregistrés</p>
        </div>
        <div className="flex items-center gap-2">
          {peutExporter && (
            <button
              onClick={handleExportPdf}
              disabled={exportPending}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium flex-shrink-0 hover:bg-gray-50 disabled:opacity-60"
            >
              {exportPending ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              <span className="hidden sm:inline">Exporter PDF</span>
            </button>
          )}
          {peutCreer && (
            <button
              onClick={() => setModalOuvert(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-white text-sm font-medium flex-shrink-0"
              style={{ backgroundColor: "#1a4731" }}
            >
              <UserPlus size={16} />
              <span className="hidden sm:inline">Nouveau membre</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-0" style={{ minWidth: "160px" }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher nom, téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value as "" | "actif" | "inactif")}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="">Tous</option>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nom & Prénoms</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Village</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Groupement</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Superficie</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : membres.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-12">Aucun membre trouvé</td>
              </tr>
            ) : (
              membres.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <span className="text-gray-500 font-normal text-xs mr-1">
                      {m.sexe === "M" ? "M." : m.sexe === "F" ? "Mme" : ""}
                    </span>
                    {m.nom} {m.prenoms}
                    {m.sexe && (
                      <span className="ml-1 text-xs" title={m.sexe === "M" ? "Homme" : "Femme"}>
                        {m.sexe === "M" ? "♂" : "♀"}
                      </span>
                    )}
                    <div className="text-xs text-green-700 font-mono font-semibold mt-0.5">
                      {m.codeMembre}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.telephone}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{m.village ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{m.groupement ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{parseFloat(m.superficieHa).toFixed(2)} ha</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        m.statut === "actif"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.statut === "actif" ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => navigate(`/membres/${m.id}`)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Eye size={13} />
                      Voir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal nouveau membre */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Nouveau membre</h3>
              <button onClick={() => setModalOuvert(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Civilité / Genre</label>
                <div className="flex gap-3">
                  {(["M", "F"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="civilite"
                        value={v}
                        checked={form.sexe === v}
                        onChange={() => setForm({ ...form, sexe: v })}
                        className="accent-green-700"
                      />
                      <span className="text-sm text-gray-700">{v === "M" ? "Monsieur (Homme)" : "Madame (Femme)"}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                  <input
                    required
                    value={form.nom ?? ""}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    placeholder="KOUASSI"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prénoms *</label>
                  <input
                    required
                    value={form.prenoms ?? ""}
                    onChange={(e) => setForm({ ...form, prenoms: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    placeholder="Koffi Jean"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone *</label>
                  <input
                    required
                    value={form.telephone ?? ""}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    placeholder="07 XX XX XX XX"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° CNI</label>
                  <input
                    value={form.numeroCni ?? ""}
                    onChange={(e) => setForm({ ...form, numeroCni: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Village</label>
                  <input
                    value={form.village ?? ""}
                    onChange={(e) => setForm({ ...form, village: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Groupement</label>
                  <input
                    value={form.groupement ?? ""}
                    onChange={(e) => setForm({ ...form, groupement: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Superficie (ha) *</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.superficieHa ?? ""}
                    onChange={(e) => setForm({ ...form, superficieHa: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date adhésion *</label>
                  <input
                    required
                    type="date"
                    value={form.dateAdhesion ?? ""}
                    onChange={(e) => setForm({ ...form, dateAdhesion: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
                <select
                  value={form.statut ?? "actif"}
                  onChange={(e) => setForm({ ...form, statut: e.target.value as "actif" | "inactif" })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
              {mutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  Erreur lors de la création du membre
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setModalOuvert(false); resetForm(); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  {mutation.isPending ? "Enregistrement…" : "Créer le membre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
