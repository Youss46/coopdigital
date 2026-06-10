import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateMembre, type MembreInput } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  UserPlus, Search, Eye, FileDown, Loader2,
  Building2, User, AlertTriangle, CheckCircle,
  XCircle, Clock, MapPin, ClipboardList,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DelegueInfo {
  id: number; nom: string; prenoms: string;
  telephone: string | null; zoneType: string | null;
  zoneNom: string | null; section: string | null;
}

interface MembreRow {
  id: number; nom: string; prenoms: string;
  telephone: string; village?: string | null;
  statut: string; statutMembre?: string | null;
  completudeFiche?: number | null;
  completudeIdentite?: number | null;
  completudeEudr?: number | null;
  statutEudr?: string | null;
  missionGpsRequise?: boolean | null;
  delegueId?: number | null; rattachementType?: string | null;
  zoneNom?: string | null; sexe?: string | null;
  superficieHa: string; codeMembre?: string;
  demandeParDelegueId?: number | null;
  motifRejet?: string | null; createdAt?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COOP_ID_PAR_DEFAUT = 1;
const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) } });

function badgeStatutMembre(s: string | null | undefined) {
  switch (s) {
    case "actif":      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={10} />Actif</span>;
    case "en_attente": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700"><Clock size={10} />En attente</span>;
    case "rejete":     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle size={10} />Rejeté</span>;
    case "suspendu":   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Suspendu</span>;
    default:           return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">{s ?? "—"}</span>;
  }
}

function BarreCompletudeDuo({ identite, eudr }: { identite: number | null | undefined; eudr: number | null | undefined }) {
  const ci = identite ?? 0;
  const ce = eudr ?? 0;
  const colI = ci === 100 ? "bg-green-500" : ci >= 60 ? "bg-yellow-400" : "bg-red-400";
  const colE = ce === 100 ? "bg-green-500" : ce >= 60 ? "bg-blue-400" : "bg-gray-300";
  return (
    <div className="w-full space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 w-5">ID</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${colI}`} style={{ width: `${ci}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-6 text-right">{ci}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 w-5">GPS</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${colE}`} style={{ width: `${ce}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-6 text-right">{ce}%</span>
      </div>
    </div>
  );
}

function BarreCompletude({ pct }: { pct: number | null | undefined }) {
  const v = pct ?? 0;
  const color = v === 100 ? "bg-green-500" : v >= 50 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
        </div>
        <span className="text-xs text-gray-500 w-8 text-right">{v}%</span>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Membres() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();

  const peutCreer   = usePermission("membres", "creer");
  const peutExporter = usePermission("membres", "exporter");
  const peutValider = usePermission("membres", "valider");

  const estDelegue  = utilisateur?.role === "delegue";
  const estRT       = utilisateur?.role === "responsable_tracabilite";
  const estDirection = utilisateur?.role === "pca" || utilisateur?.role === "directeur";

  // ── State ───────────────────────────────────────────────────────────────────
  const [onglet, setOnglet] = useState<"membres" | "demandes">("membres");
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<"" | "actif" | "inactif">("");
  const [filtreStatutMembre, setFiltreStatutMembre] = useState("");
  const [filtreDelegueId, setFiltreDelegueId] = useState<number | undefined>(undefined);
  const [filtreRattachement, setFiltreRattachement] = useState<"" | "delegue" | "base_centrale">("");
  const [exportPending, setExportPending] = useState(false);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [modalRejet, setModalRejet] = useState<{ id: number; nom: string } | null>(null);
  const [motifRejetText, setMotifRejetText] = useState("");

  const [form, setForm] = useState<Partial<MembreInput> & { rattachementType: "delegue" | "base_centrale"; delegueId?: number }>({
    cooperativeId: COOP_ID_PAR_DEFAUT,
    statut: "actif",
    dateAdhesion: new Date().toISOString().split("T")[0],
    rattachementType: "delegue",
    delegueId: undefined,
  });

  // ── Queries ─────────────────────────────────────────────────────────────────

  const searchParams = new URLSearchParams({ limit: "50" });
  if (recherche) searchParams.set("search", recherche);
  if (statut) searchParams.set("statut", statut);
  if (filtreStatutMembre) searchParams.set("statut_membre", filtreStatutMembre);
  if (filtreDelegueId) searchParams.set("delegueId", String(filtreDelegueId));
  if (filtreRattachement) searchParams.set("rattachementType", filtreRattachement);

  const { data, isLoading, refetch: refetchListe } = useQuery<{ membres: MembreRow[]; total: number }>({
    queryKey: ["membres-list", searchParams.toString(), utilisateur?.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/membres?${searchParams.toString()}`);
      if (!r.ok) return { membres: [], total: 0 };
      return r.json() as Promise<{ membres: MembreRow[]; total: number }>;
    },
    enabled: !!utilisateur && (!estDelegue || onglet === "membres"),
  });

  const { data: demandesData, isLoading: demandesLoading, refetch: refetchDemandes } = useQuery<{ membres: MembreRow[]; total: number }>({
    queryKey: ["membres-demandes", utilisateur?.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/membres?vue=demandes&limit=50`);
      if (!r.ok) return { membres: [], total: 0 };
      return r.json() as Promise<{ membres: MembreRow[]; total: number }>;
    },
    enabled: estDelegue && onglet === "demandes",
  });

  const { data: delegues = [] } = useQuery<DelegueInfo[]>({
    queryKey: ["delegues-pour-membres"],
    queryFn: async () => {
      const r = await apiFetch("/api/membres/delegues-list");
      if (!r.ok) return [];
      return r.json() as Promise<DelegueInfo[]>;
    },
    enabled: !!utilisateur,
  });

  const membres: MembreRow[] = (onglet === "demandes" ? demandesData?.membres : data?.membres) ?? [];
  const delegueCourant = estDelegue ? delegues.find((d) => d.id === utilisateur?.id) : null;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const mutation = useCreateMembre({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["membres-list"] });
        setModalOuvert(false);
        resetForm();
      },
    },
  });

  const validerMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/membres/${id}/valider`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur validation"); }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["membres-list"] });
      void queryClient.invalidateQueries({ queryKey: ["membres-demandes"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const rejeterMutation = useMutation({
    mutationFn: async ({ id, motif }: { id: number; motif: string }) => {
      const r = await apiFetch(`/api/membres/${id}/rejeter`, { method: "POST", body: JSON.stringify({ motif }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur rejet"); }
      return r.json();
    },
    onSuccess: () => {
      setModalRejet(null);
      setMotifRejetText("");
      void queryClient.invalidateQueries({ queryKey: ["membres-list"] });
      void queryClient.invalidateQueries({ queryKey: ["membres-demandes"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const resetForm = () =>
    setForm({ cooperativeId: COOP_ID_PAR_DEFAUT, statut: "actif", dateAdhesion: new Date().toISOString().split("T")[0], rattachementType: "delegue", delegueId: undefined });

  async function handleExportPdf() {
    setExportPending(true);
    try {
      const params = statut ? `?statut=${statut}` : "";
      const res = await apiFetch(`/api/membres/export-pdf${params}`);
      if (!res.ok) throw new Error("Erreur export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `membres-${statut || "tous"}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch { alert("Impossible de générer le PDF"); }
    finally { setExportPending(false); }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.prenoms || !form.telephone || !form.superficieHa) return;
    const delegueIdFinal = estDelegue ? utilisateur?.id : form.delegueId;
    const rattachementTypeFinal = estDelegue ? "delegue" : form.rattachementType;
    mutation.mutate({
      data: {
        cooperativeId: COOP_ID_PAR_DEFAUT,
        nom: form.nom!, prenoms: form.prenoms!,
        telephone: form.telephone!, superficieHa: String(form.superficieHa),
        dateAdhesion: form.dateAdhesion!, statut: form.statut as "actif" | "inactif",
        village: form.village, groupement: form.groupement,
        numeroCni: form.numeroCni, sexe: form.sexe as "M" | "F" | undefined,
        delegueId: delegueIdFinal, rattachementType: rattachementTypeFinal,
        dateNaissance: (form as Record<string, unknown>)["dateNaissance"] as string | undefined,
        typeFournisseur: (form as Record<string, unknown>)["typeFournisseur"] as "membre" | "pisteur" | "externe" | undefined,
        nbrePartsSouscrites: (form as Record<string, unknown>)["nbrePartsSouscrites"] ? Number((form as Record<string, unknown>)["nbrePartsSouscrites"]) : undefined,
      },
    });
  };

  // ── Helpers visuels ───────────────────────────────────────────────────────────

  function badgeRattachement(m: MembreRow) {
    if (m.rattachementType === "base_centrale")
      return <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full"><Building2 size={10} />Base centrale</span>;
    if (m.delegueId) {
      const d = delegues.find((d) => d.id === m.delegueId);
      const label = d ? `${d.nom} ${d.prenoms?.split(" ")[0] ?? ""}` : `Délégué #${m.delegueId}`;
      return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><User size={10} />{label}</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} />Non assigné</span>;
  }

  const sanRattachement = !estDelegue ? membres.filter((m) => !m.delegueId && m.rattachementType !== "base_centrale").length : 0;
  const enAttente = !estDelegue ? (data?.membres ?? []).filter((m) => m.statutMembre === "en_attente").length : 0;

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  const afficheDemandes = estDelegue && onglet === "demandes";
  const afficheMembres = !estDelegue || onglet === "membres";
  const isLoadingCurrent = afficheDemandes ? demandesLoading : isLoading;

  return (
    <div className="space-y-5">

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {estDelegue ? `Mes membres${delegueCourant?.zoneNom ? ` — ${delegueCourant.zoneNom}` : ""}` : "Membres"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {afficheDemandes ? `${demandesData?.total ?? 0} demandes` : `${data?.total ?? 0} membres${estDelegue ? " actifs dans votre zone" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {peutExporter && !estDelegue && (
            <button onClick={handleExportPdf} disabled={exportPending}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
              {exportPending ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              <span className="hidden sm:inline">Exporter PDF</span>
            </button>
          )}
          {(estRT || estDirection) && (
            <button onClick={() => navigate("/missions")}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">
              <MapPin size={15} />
              <span className="hidden sm:inline">Missions terrain</span>
            </button>
          )}
          {peutCreer && (
            <button onClick={() => setModalOuvert(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: "#1a4731" }}>
              <UserPlus size={16} />
              <span className="hidden sm:inline">{estDelegue ? "Soumettre une demande" : "Nouveau membre"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs délégué ─────────────────────────────────────────────────────── */}
      {estDelegue && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {([["membres", <ClipboardList size={14} />, "Mes membres"], ["demandes", <Clock size={14} />, "Mes demandes"]] as const).map(([key, icon, label]) => (
            <button key={key} onClick={() => setOnglet(key as "membres" | "demandes")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${onglet === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {icon}{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Alertes ──────────────────────────────────────────────────────────── */}
      {sanRattachement > 0 && estDirection && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">{sanRattachement} membre{sanRattachement > 1 ? "s" : ""}</span> sans rattachement assigné.
          </p>
        </div>
      )}
      {enAttente > 0 && peutValider && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <Clock size={16} className="text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800">
            <span className="font-semibold">{enAttente} demande{enAttente > 1 ? "s" : ""}</span> en attente de validation.
            <button className="ml-2 text-yellow-700 underline text-xs" onClick={() => setFiltreStatutMembre("en_attente")}>Voir</button>
          </p>
        </div>
      )}

      {/* ── Filtres ───────────────────────────────────────────────────────────── */}
      {!afficheDemandes && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-0" style={{ minWidth: "160px" }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" placeholder="Rechercher nom, téléphone…" value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1" />
          </div>

          {!estDelegue && (
            <>
              <select value={filtreStatutMembre} onChange={(e) => setFiltreStatutMembre(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="">Tous statuts</option>
                <option value="en_attente">⏳ En attente</option>
                <option value="actif">✅ Actif</option>
                <option value="rejete">❌ Rejeté</option>
                <option value="suspendu">⏸ Suspendu</option>
              </select>
              <select value={filtreDelegueId ?? ""} onChange={(e) => setFiltreDelegueId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="">Tous les délégués</option>
                {delegues.map((d) => (
                  <option key={d.id} value={d.id}>{d.nom} {d.prenoms}{d.zoneNom ? ` — ${d.zoneNom}` : ""}</option>
                ))}
              </select>
              <select value={filtreRattachement}
                onChange={(e) => { setFiltreRattachement(e.target.value as "" | "delegue" | "base_centrale"); setFiltreDelegueId(undefined); }}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="">Tous rattachements</option>
                <option value="delegue">Délégué de localité</option>
                <option value="base_centrale">🏢 Base centrale</option>
              </select>
            </>
          )}
        </div>
      )}

      {/* ── TABLE — Mes membres / direction ──────────────────────────────────── */}
      {!afficheDemandes && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom & Prénoms</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Village</th>
                {!estDelegue && <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Rattachement</th>}
                {(estRT || estDirection) && <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Complétion</th>}
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoadingCurrent ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : membres.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12">Aucun membre trouvé</td></tr>
              ) : membres.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <span className="text-gray-500 font-normal text-xs mr-1">{m.sexe === "M" ? "M." : m.sexe === "F" ? "Mme" : ""}</span>
                    {m.nom} {m.prenoms}
                    {m.codeMembre && <div className="text-xs text-green-700 font-mono font-semibold mt-0.5">{m.codeMembre}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.telephone}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{m.village ?? "—"}</td>
                  {!estDelegue && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      {badgeRattachement(m)}
                      {m.zoneNom && <div className="text-xs text-gray-400 mt-0.5">{m.zoneNom}</div>}
                    </td>
                  )}
                  {(estRT || estDirection) && (
                    <td className="px-4 py-3 hidden lg:table-cell w-32">
                      <BarreCompletudeDuo identite={m.completudeIdentite} eudr={m.completudeEudr} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    {badgeStatutMembre(m.statutMembre)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => navigate(`/membres/${m.id}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium p-1 rounded">
                        <Eye size={13} />Voir
                      </button>
                      {peutValider && m.statutMembre === "en_attente" && (
                        <>
                          <button
                            disabled={validerMutation.isPending}
                            onClick={() => validerMutation.mutate(m.id)}
                            className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium p-1 rounded disabled:opacity-50">
                            <CheckCircle size={13} />
                          </button>
                          <button
                            onClick={() => { setModalRejet({ id: m.id, nom: `${m.prenoms} ${m.nom}` }); setMotifRejetText(""); }}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium p-1 rounded">
                            <XCircle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TABLE — Mes demandes (délégué) ────────────────────────────────────── */}
      {afficheDemandes && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom & Prénoms</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Village</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Motif rejet</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {demandesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : membres.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-12">Aucune demande soumise</td></tr>
              ) : membres.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.prenoms} {m.nom}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{m.village ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">{badgeStatutMembre(m.statutMembre)}</td>
                  <td className="px-4 py-3 text-xs text-red-600 hidden md:table-cell">{m.motifRejet ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => navigate(`/membres/${m.id}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium p-1 rounded">
                        <Eye size={13} />Voir
                      </button>
                      {m.statutMembre === "rejete" && (
                        <button onClick={() => navigate(`/membres/${m.id}`)}
                          className="text-xs text-orange-600 hover:text-orange-800 font-medium px-2 py-0.5 rounded border border-orange-200 hover:bg-orange-50">
                          Corriger
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal rejet ──────────────────────────────────────────────────────── */}
      {modalRejet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Rejeter la demande</h3>
              <p className="text-sm text-gray-500 mt-1">{modalRejet.nom}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Motif de rejet *</label>
              <textarea value={motifRejetText} onChange={(e) => setMotifRejetText(e.target.value)}
                rows={3} placeholder="Expliquer le motif de rejet…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 resize-none" />
              <div className="flex gap-3">
                <button onClick={() => setModalRejet(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!motifRejetText.trim() || rejeterMutation.isPending}
                  onClick={() => rejeterMutation.mutate({ id: modalRejet.id, motif: motifRejetText })}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  {rejeterMutation.isPending ? "…" : "Rejeter"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nouveau membre ─────────────────────────────────────────────── */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{estDelegue ? "Soumettre une demande" : "Nouveau membre"}</h3>
                {estDelegue && <p className="text-xs text-yellow-700 mt-0.5">⏳ La demande sera examinée par le responsable traçabilité.</p>}
              </div>
              <button onClick={() => setModalOuvert(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* Civilité */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Civilité / Genre</label>
                <div className="flex gap-3">
                  {(["M", "F"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="civilite" value={v} checked={form.sexe === v}
                        onChange={() => setForm({ ...form, sexe: v })} className="accent-green-700" />
                      <span className="text-sm text-gray-700">{v === "M" ? "Monsieur" : "Madame"}</span>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Village {estDelegue && "*"}</label>
                  <input required={estDelegue} value={form.village ?? ""} onChange={(e) => setForm({ ...form, village: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Groupement / Section</label>
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

              {/* Date de naissance + N° CNI */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date de naissance</label>
                  <input type="date" value={((form as Record<string, unknown>)["dateNaissance"] as string) ?? ""}
                    onChange={(e) => setForm({ ...form, ...{ dateNaissance: e.target.value } } as typeof form)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parts souscrites</label>
                  <input type="number" min="0" step="1" value={((form as Record<string, unknown>)["nbrePartsSouscrites"] as string) ?? ""}
                    onChange={(e) => setForm({ ...form, ...{ nbrePartsSouscrites: e.target.value } } as typeof form)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
              </div>

              {/* Type fournisseur */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type fournisseur</label>
                <select value={((form as Record<string, unknown>)["typeFournisseur"] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, ...{ typeFournisseur: e.target.value || undefined } } as typeof form)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1">
                  <option value="">— Non renseigné —</option>
                  <option value="membre">Membre</option>
                  <option value="pisteur">Pisteur</option>
                  <option value="externe">Externe</option>
                </select>
              </div>

              {/* Rattachement */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Rattachement</p>
                {estDelegue ? (
                  <div className="bg-green-50 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Rattachement automatique</p>
                    <p className="text-sm font-medium text-gray-800"><User size={12} className="inline mr-1 text-green-600" />{utilisateur?.nom} {utilisateur?.prenoms}</p>
                    {delegueCourant?.zoneNom && <p className="text-xs text-gray-500 mt-0.5">Zone : {delegueCourant.zoneNom}</p>}
                    <p className="text-xs text-yellow-600 mt-1">⏳ La demande sera soumise en attente de validation</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-4">
                      {(["delegue", "base_centrale"] as const).map((v) => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="rattachementType" value={v}
                            checked={form.rattachementType === v}
                            onChange={() => setForm({ ...form, rattachementType: v, delegueId: undefined })}
                            className="accent-green-700" />
                          <span className="text-sm text-gray-700">{v === "delegue" ? "Délégué de localité" : "Base centrale"}</span>
                        </label>
                      ))}
                    </div>
                    {form.rattachementType === "delegue" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délégué responsable *</label>
                        <select value={form.delegueId ?? ""}
                          onChange={(e) => setForm({ ...form, delegueId: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                          <option value="">Sélectionner un délégué…</option>
                          {delegues.map((d) => (
                            <option key={d.id} value={d.id}>{d.nom} {d.prenoms}{d.zoneNom ? ` — ${d.zoneNom}` : ""}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {form.rattachementType === "base_centrale" && (
                      <div className="bg-purple-50 rounded-lg px-3 py-2.5 text-xs text-purple-700">
                        <Building2 size={12} className="inline mr-1" />Ce membre sera géré directement par la direction.
                      </div>
                    )}
                  </>
                )}
              </div>

              {mutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">Erreur lors de la création</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setModalOuvert(false); resetForm(); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={mutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}>
                  {mutation.isPending ? "Enregistrement…" : estDelegue ? "Soumettre la demande →" : "Créer le membre →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
