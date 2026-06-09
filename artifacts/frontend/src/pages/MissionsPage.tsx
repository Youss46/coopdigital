import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Plus, Eye, Clock, CheckCircle, XCircle,
  ChevronLeft, Users, Target, Calendar, Loader2, AlertTriangle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Mission {
  id: number;
  titre: string;
  zoneType: string;
  zoneNom: string;
  datePrevue: string;
  statut: string;
  objectifParcelles?: number | null;
  parcellesCollectees?: number | null;
  agentNom?: string | null;
  agentPrenoms?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface Agent { id: number; nom: string; prenoms: string; telephone: string | null; zoneNom: string | null; }
interface MembreSansGps { id: number; nom: string; prenoms: string; village?: string | null; zoneNom?: string | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) } });

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  planifiee:  { label: "Planifiée",  color: "bg-blue-100 text-blue-700" },
  en_cours:   { label: "En cours",   color: "bg-orange-100 text-orange-700" },
  soumise:    { label: "À valider",  color: "bg-yellow-100 text-yellow-700" },
  validee:    { label: "Validée",    color: "bg-green-100 text-green-700" },
  rejetee:    { label: "Rejetée",    color: "bg-red-100 text-red-700" },
};

function BadgeStatut({ statut }: { statut: string }) {
  const cfg = STATUT_LABELS[statut] ?? { label: statut, color: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MissionsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();
  const peutCreer = usePermission("missions", "creer");
  const estAgent = utilisateur?.role === "agent_terrain";

  const [filtreStatut, setFiltreStatut] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);

  // Formulaire nouvelle mission
  const [form, setForm] = useState({
    titre: "", zoneType: "village", zoneNom: "", datePrevue: "",
    agentId: "" as string | number, notes: "", membreIdsSelectes: [] as number[],
  });

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: missions = [], isLoading } = useQuery<Mission[]>({
    queryKey: ["missions", filtreStatut, utilisateur?.id],
    queryFn: async () => {
      const params = filtreStatut ? `?statut=${filtreStatut}` : "";
      const r = await apiFetch(`/api/missions${params}`);
      if (!r.ok) return [];
      return r.json() as Promise<Mission[]>;
    },
    enabled: !!utilisateur,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["agents-terrain"],
    queryFn: async () => {
      const r = await apiFetch("/api/missions/agents-terrain");
      if (!r.ok) return [];
      return r.json() as Promise<Agent[]>;
    },
    enabled: peutCreer,
  });

  const { data: membresSansGps = [] } = useQuery<MembreSansGps[]>({
    queryKey: ["membres-sans-gps", form.zoneNom],
    queryFn: async () => {
      const params = form.zoneNom ? `?zoneNom=${encodeURIComponent(form.zoneNom)}` : "";
      const r = await apiFetch(`/api/missions/sans-gps${params}`);
      if (!r.ok) return [];
      return r.json() as Promise<MembreSansGps[]>;
    },
    enabled: peutCreer && modalOuvert && !!form.zoneNom,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMission = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/missions", {
        method: "POST",
        body: JSON.stringify({
          titre: form.titre, zoneType: form.zoneType, zoneNom: form.zoneNom,
          datePrevue: form.datePrevue, agentId: form.agentId ? Number(form.agentId) : undefined,
          membreIds: form.membreIdsSelectes, notes: form.notes || undefined,
          objectifParcelles: form.membreIdsSelectes.length || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
      setModalOuvert(false);
      setForm({ titre: "", zoneType: "village", zoneNom: "", datePrevue: "", agentId: "", notes: "", membreIdsSelectes: [] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const demarrerMission = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/missions/${id}/demarrer`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["missions"] }),
    onError: (e: Error) => alert(e.message),
  });

  const soumettreM = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/missions/${id}/soumettre`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["missions"] }),
    onError: (e: Error) => alert(e.message),
  });

  // Filtres par onglet
  const TABS = [
    { key: "", label: "Toutes" },
    { key: "planifiee", label: "Planifiées" },
    { key: "en_cours",  label: "En cours" },
    { key: "soumise",   label: "À valider" },
    { key: "validee",   label: "Validées" },
  ];

  const toggleMembre = (id: number) =>
    setForm((f) => ({
      ...f,
      membreIdsSelectes: f.membreIdsSelectes.includes(id)
        ? f.membreIdsSelectes.filter((x) => x !== id)
        : [...f.membreIdsSelectes, id],
    }));

  return (
    <div className="space-y-5">

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/membres")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft size={16} />Membres
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MapPin size={22} className="text-green-700" />Missions terrain
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{missions.length} mission{missions.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {peutCreer && (
          <button onClick={() => setModalOuvert(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: "#1a4731" }}>
            <Plus size={16} />Nouvelle mission
          </button>
        )}
      </div>

      {/* ── Tabs statut ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setFiltreStatut(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtreStatut === t.key ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Liste des missions ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : missions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <MapPin size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Aucune mission{filtreStatut ? ` en statut "${STATUT_LABELS[filtreStatut]?.label ?? filtreStatut}"` : ""}</p>
          {peutCreer && (
            <button onClick={() => setModalOuvert(true)} className="mt-4 text-sm text-green-700 hover:underline">
              Créer une première mission →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {missions.map((m) => {
            const progression = m.objectifParcelles ? Math.round(((m.parcellesCollectees ?? 0) / m.objectifParcelles) * 100) : 0;
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{m.titre}</h3>
                  <BadgeStatut statut={m.statut} />
                </div>

                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} />{m.zoneNom} ({m.zoneType})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} />{new Date(m.datePrevue).toLocaleDateString("fr-FR")}
                  </div>
                  {(m.agentNom ?? m.agentPrenoms) && (
                    <div className="flex items-center gap-1.5">
                      <Users size={11} />{m.agentPrenoms} {m.agentNom}
                    </div>
                  )}
                </div>

                {m.objectifParcelles && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span><Target size={10} className="inline mr-1" />{m.parcellesCollectees ?? 0}/{m.objectifParcelles} parcelles</span>
                      <span>{progression}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${progression === 100 ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${progression}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => navigate(`/missions/${m.id}`)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    <Eye size={12} />Détail
                  </button>
                  {estAgent && m.statut === "planifiee" && (
                    <button onClick={() => demarrerMission.mutate(m.id)} disabled={demarrerMission.isPending}
                      className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      Démarrer
                    </button>
                  )}
                  {estAgent && m.statut === "en_cours" && (
                    <button onClick={() => soumettreM.mutate(m.id)} disabled={soumettreM.isPending}
                      className="flex-1 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                      Soumettre
                    </button>
                  )}
                  {!estAgent && m.statut === "soumise" && (
                    <button onClick={() => navigate(`/missions/${m.id}`)}
                      className="flex-1 py-1.5 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                      Valider →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal nouvelle mission ───────────────────────────────────────────── */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Nouvelle mission terrain</h3>
              <button onClick={() => setModalOuvert(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre de la mission *</label>
                <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                  placeholder="Collecte GPS — Zone Broukro" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type de zone *</label>
                  <select value={form.zoneType} onChange={(e) => setForm({ ...form, zoneType: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="village">Village</option>
                    <option value="section">Section</option>
                    <option value="groupement">Groupement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la zone *</label>
                  <input value={form.zoneNom} onChange={(e) => setForm({ ...form, zoneNom: e.target.value, membreIdsSelectes: [] })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    placeholder="Broukro" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date prévue *</label>
                  <input type="date" value={form.datePrevue} onChange={(e) => setForm({ ...form, datePrevue: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Agent terrain</label>
                  <select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Sélectionner…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.nom} {a.prenoms}{a.zoneNom ? ` — ${a.zoneNom}` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Membres sans GPS */}
              {form.zoneNom && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">
                      Membres à mapper ({membresSansGps.length} sans GPS dans cette zone)
                    </label>
                    {membresSansGps.length > 0 && (
                      <button type="button" onClick={() => setForm({ ...form, membreIdsSelectes: membresSansGps.map((m) => m.id) })}
                        className="text-xs text-green-700 hover:underline">Sélectionner tous</button>
                    )}
                  </div>
                  {membresSansGps.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Aucun membre sans GPS dans cette zone</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                      {membresSansGps.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                          <input type="checkbox" checked={form.membreIdsSelectes.includes(m.id)}
                            onChange={() => toggleMembre(m.id)} className="accent-green-700" />
                          <span className="text-sm text-gray-800">{m.prenoms} {m.nom}</span>
                          {m.village && <span className="text-xs text-gray-400 ml-auto">{m.village}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                  {form.membreIdsSelectes.length > 0 && (
                    <p className="text-xs text-green-700 mt-1">{form.membreIdsSelectes.length} membre{form.membreIdsSelectes.length > 1 ? "s" : ""} sélectionné{form.membreIdsSelectes.length > 1 ? "s" : ""}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes pour l'agent</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  placeholder="Instructions particulières…" />
              </div>

              {createMission.isError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle size={14} />{(createMission.error as Error).message}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalOuvert(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!form.titre || !form.zoneNom || !form.datePrevue || createMission.isPending}
                  onClick={() => createMission.mutate()}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: "#1a4731" }}>
                  {createMission.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Créer la mission →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
