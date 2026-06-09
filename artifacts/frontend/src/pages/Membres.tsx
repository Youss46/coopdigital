import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMembres,
  useCreateMembre,
  type MembreInput,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMembresQueryKey } from "@workspace/api-client-react";
import { UserPlus, Search, Eye, FileDown, Loader2, Building2, User, AlertTriangle } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DelegueInfo {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string | null;
  zoneType: string | null;
  zoneNom: string | null;
  section: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COOP_ID_PAR_DEFAUT = 1;

const tok = () => localStorage.getItem("coop_token") ?? "";

// ── Composant principal ───────────────────────────────────────────────────────

export default function Membres() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();

  const peutCreer = usePermission("membres", "creer");
  const peutExporter = usePermission("membres", "exporter");
  const [exportPending, setExportPending] = useState(false);

  const estDelegue = utilisateur?.role === "delegue";
  const estDirection = utilisateur?.role === "pca" || utilisateur?.role === "directeur";

  // Filtres
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<"" | "actif" | "inactif">("");
  const [filtreDelegueId, setFiltreDelegueId] = useState<number | undefined>(undefined);
  const [filtreRattachement, setFiltreRattachement] = useState<"" | "delegue" | "base_centrale">("");

  const [modalOuvert, setModalOuvert] = useState(false);

  // Formulaire création
  const [form, setForm] = useState<Partial<MembreInput> & { rattachementType: "delegue" | "base_centrale"; delegueId?: number }>({
    cooperativeId: COOP_ID_PAR_DEFAUT,
    statut: "actif",
    dateAdhesion: new Date().toISOString().split("T")[0],
    rattachementType: "delegue",
    delegueId: undefined,
  });

  // Données
  const { data, isLoading } = useGetMembres({
    search: recherche || undefined,
    statut: statut || undefined,
    limit: 50,
    delegueId: filtreDelegueId,
    rattachementType: filtreRattachement || undefined,
  });

  const membres = data?.membres ?? [];

  // Liste des délégués pour le dropdown
  const { data: delegues = [] } = useQuery<DelegueInfo[]>({
    queryKey: ["delegues-pour-membres"],
    queryFn: async () => {
      const r = await fetch("/api/membres/delegues-list", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) return [];
      return r.json() as Promise<DelegueInfo[]>;
    },
    enabled: !!utilisateur,
  });

  // Délégué courant (si l'utilisateur est lui-même délégué)
  const delegueCourant = estDelegue ? delegues.find((d) => d.id === utilisateur?.id) : null;

  // Mutation création
  const mutation = useCreateMembre({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMembresQueryKey() });
        setModalOuvert(false);
        resetForm();
      },
    },
  });

  const resetForm = () =>
    setForm({
      cooperativeId: COOP_ID_PAR_DEFAUT,
      statut: "actif",
      dateAdhesion: new Date().toISOString().split("T")[0],
      rattachementType: "delegue",
      delegueId: undefined,
    });

  async function handleExportPdf() {
    setExportPending(true);
    try {
      const params = statut ? `?statut=${statut}` : "";
      const res = await fetch(`/api/membres/export-pdf${params}`, {
        headers: { Authorization: `Bearer ${tok()}` },
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.prenoms || !form.telephone || !form.superficieHa) return;

    const delegueIdFinal = estDelegue ? utilisateur?.id : form.delegueId;
    const rattachementTypeFinal = estDelegue ? "delegue" : form.rattachementType;

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
        sexe: form.sexe as "M" | "F" | undefined,
        delegueId: delegueIdFinal,
        rattachementType: rattachementTypeFinal,
      },
    });
  };

  // ── Bloc rattachement dans la liste ──────────────────────────────────────────
  function badgeRattachement(m: (typeof membres)[number]) {
    if (m.rattachementType === "base_centrale") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
          <Building2 size={10} />Base centrale
        </span>
      );
    }
    if (m.delegueId) {
      const d = delegues.find((d) => d.id === m.delegueId);
      const label = d ? `${d.nom} ${d.prenoms?.split(" ")[0] ?? ""}` : `Délégué #${m.delegueId}`;
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          <User size={10} />{label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
        <AlertTriangle size={10} />Non assigné
      </span>
    );
  }

  // Membres sans rattachement (pour l'alerte)
  const sanRattachement = !estDelegue ? membres.filter((m) => !m.delegueId && m.rattachementType !== "base_centrale").length : 0;

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {estDelegue ? `Mes membres${delegueCourant?.zoneNom ? ` — ${delegueCourant.zoneNom}` : ""}` : "Membres"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total ?? 0} membres{estDelegue ? " dans votre zone" : " enregistrés"}</p>
        </div>
        <div className="flex items-center gap-2">
          {peutExporter && !estDelegue && (
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

      {/* Alerte membres sans rattachement */}
      {sanRattachement > 0 && estDirection && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">{sanRattachement} membre{sanRattachement > 1 ? "s" : ""}</span> n'ont pas encore de rattachement assigné.
          </p>
        </div>
      )}

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
          <option value="">Tous statuts</option>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </select>

        {/* Filtres direction uniquement */}
        {!estDelegue && (
          <>
            <select
              value={filtreDelegueId ?? ""}
              onChange={(e) => setFiltreDelegueId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            >
              <option value="">Tous les délégués</option>
              {delegues.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} {d.prenoms} {d.zoneNom ? `— ${d.zoneNom}` : ""}
                </option>
              ))}
            </select>
            <select
              value={filtreRattachement}
              onChange={(e) => {
                setFiltreRattachement(e.target.value as "" | "delegue" | "base_centrale");
                setFiltreDelegueId(undefined);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            >
              <option value="">Tous rattachements</option>
              <option value="delegue">Délégué de localité</option>
              <option value="base_centrale">🏢 Base centrale</option>
            </select>
          </>
        )}
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nom & Prénoms</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Village</th>
              {!estDelegue && (
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Rattachement</th>
              )}
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
                    <div className="text-xs text-green-700 font-mono font-semibold mt-0.5">
                      {m.codeMembre}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.telephone}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{m.village ?? "—"}</td>
                  {!estDelegue && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      {badgeRattachement(m)}
                      {m.zoneNom && (
                        <div className="text-xs text-gray-400 mt-0.5">{m.zoneNom}</div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{parseFloat(m.superficieHa).toFixed(2)} ha</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        m.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
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

              {/* Civilité */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Civilité / Genre</label>
                <div className="flex gap-3">
                  {(["M", "F"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio" name="civilite" value={v}
                        checked={form.sexe === v}
                        onChange={() => setForm({ ...form, sexe: v })}
                        className="accent-green-700"
                      />
                      <span className="text-sm text-gray-700">{v === "M" ? "Monsieur (Homme)" : "Madame (Femme)"}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Nom + Prénoms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                  <input required value={form.nom ?? ""} onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" placeholder="KOUASSI" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prénoms *</label>
                  <input required value={form.prenoms ?? ""} onChange={(e) => setForm({ ...form, prenoms: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" placeholder="Koffi Jean" />
                </div>
              </div>

              {/* Téléphone + CNI */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone *</label>
                  <input required value={form.telephone ?? ""} onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" placeholder="07 XX XX XX XX" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° CNI</label>
                  <input value={form.numeroCni ?? ""} onChange={(e) => setForm({ ...form, numeroCni: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
              </div>

              {/* Village + Groupement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Village</label>
                  <input value={form.village ?? ""} onChange={(e) => setForm({ ...form, village: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Groupement</label>
                  <input value={form.groupement ?? ""} onChange={(e) => setForm({ ...form, groupement: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
              </div>

              {/* Superficie + Date adhésion */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Superficie (ha) *</label>
                  <input required type="number" min="0.01" step="0.01" value={form.superficieHa ?? ""}
                    onChange={(e) => setForm({ ...form, superficieHa: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date adhésion *</label>
                  <input required type="date" value={form.dateAdhesion ?? ""}
                    onChange={(e) => setForm({ ...form, dateAdhesion: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
              </div>

              {/* ── RATTACHEMENT ─────────────────────────────────────────────── */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Rattachement</p>

                {estDelegue ? (
                  /* Délégué : rattachement verrouillé sur lui-même */
                  <div className="bg-green-50 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Rattachement automatique</p>
                    <p className="text-sm font-medium text-gray-800">
                      <User size={12} className="inline mr-1 text-green-600" />
                      {utilisateur?.nom} {utilisateur?.prenoms}
                    </p>
                    {delegueCourant?.zoneNom && (
                      <p className="text-xs text-gray-500 mt-0.5">Zone : {delegueCourant.zoneNom}</p>
                    )}
                    <p className="text-xs text-green-600 mt-1">Délégué de localité — créé dans votre zone</p>
                  </div>
                ) : (
                  /* Direction : choix du type */
                  <>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio" name="rattachementType" value="delegue"
                          checked={form.rattachementType === "delegue"}
                          onChange={() => setForm({ ...form, rattachementType: "delegue", delegueId: undefined })}
                          className="accent-green-700"
                        />
                        <span className="text-sm text-gray-700">Délégué de localité</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio" name="rattachementType" value="base_centrale"
                          checked={form.rattachementType === "base_centrale"}
                          onChange={() => setForm({ ...form, rattachementType: "base_centrale", delegueId: undefined })}
                          className="accent-green-700"
                        />
                        <span className="text-sm text-gray-700">Base centrale</span>
                      </label>
                    </div>

                    {form.rattachementType === "delegue" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délégué responsable *</label>
                        <select
                          value={form.delegueId ?? ""}
                          onChange={(e) => setForm({ ...form, delegueId: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        >
                          <option value="">Sélectionner un délégué…</option>
                          {delegues.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nom} {d.prenoms}{d.zoneNom ? ` — ${d.zoneNom}` : ""}
                            </option>
                          ))}
                        </select>
                        {form.delegueId && (() => {
                          const d = delegues.find((d) => d.id === form.delegueId);
                          return d ? (
                            <div className="mt-2 bg-green-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                              <span className="font-medium text-gray-800">{d.nom} {d.prenoms}</span>
                              {d.zoneNom && <span className="ml-2 text-gray-500">Zone : {d.zoneNom}</span>}
                              {d.telephone && <span className="ml-2 text-gray-400">{d.telephone}</span>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {form.rattachementType === "base_centrale" && (
                      <div className="bg-purple-50 rounded-lg px-3 py-2.5 text-xs text-purple-700">
                        <Building2 size={12} className="inline mr-1" />
                        Ce membre sera géré directement par la direction.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Statut */}
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
