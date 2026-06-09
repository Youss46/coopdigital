import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, MapPin, Users, Package, PlayCircle,
  CheckCircle2, XCircle, Bell, BarChart3, Plus, Pencil,
  Trash2, RefreshCw, ClipboardList, TrendingUp,
} from "lucide-react";

// ─── Helpers API ─────────────────────────────────────────────────────────────

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("coop_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Zone {
  id: number;
  nom: string;
  section: string | null;
  villages: string[];
  agent_responsable_id: number | null;
  objectif_tonnage_kg: string;
}

interface Planning {
  id: number;
  zone_collecte_id: number | null;
  zone_nom: string | null;
  zone_section: string | null;
  agent_id: number | null;
  agent_nom: string | null;
  date_collecte: string;
  heure_debut: string | null;
  heure_fin: string | null;
  villages_prevus: string[];
  objectif_kg: string;
  statut: "planifie" | "en_cours" | "termine" | "annule";
  tonnage_realise_kg: string;
  nb_producteurs_prevus: number;
  nb_producteurs_venus: number;
  observations: string | null;
  sms_envoye: boolean;
}

interface Stats {
  nbPlannings: number;
  tonnagePrevu: number;
  tonnageRealise: number;
  nbTermines: number;
  nbAnnules: number;
  tauxRealisationPct: number;
  agentPlusActif: string | null;
}

interface ZoneStat {
  zoneId: number;
  zoneNom: string;
  nbPlannings: number;
  tonnagePrevu: number;
  tonnageRealise: number;
  tauxRealisation: number;
}

interface Agent { id: number; nom: string; role: string; }

// ─── Helpers UI ──────────────────────────────────────────────────────────────

const STATUT_CONFIG = {
  planifie:  { label: "Planifié",  color: "bg-blue-100 text-blue-800",   dot: "bg-blue-500" },
  en_cours:  { label: "En cours",  color: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  termine:   { label: "Terminé",   color: "bg-green-100 text-green-800",  dot: "bg-green-500" },
  annule:    { label: "Annulé",    color: "bg-red-100 text-red-800",      dot: "bg-red-500" },
} as const;

function StatutBadge({ statut }: { statut: Planning["statut"] }) {
  const cfg = STATUT_CONFIG[statut] ?? STATUT_CONFIG.planifie;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function fmtKg(v: string | number) {
  return parseFloat(String(v)).toLocaleString("fr-FR") + " kg";
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

// Get Monday of week containing given date (or today)
function getMondayOfWeek(base?: Date): Date {
  const d = base ? new Date(base) : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toIso(d: Date) { return d.toISOString().slice(0, 10); }

// ─── Modal planifier ─────────────────────────────────────────────────────────

interface ModalPlanifierProps {
  zones: Zone[];
  agents: Agent[];
  planning?: Planning | null;
  onClose: () => void;
  onSaved: () => void;
}

function ModalPlanifier({ zones, agents, planning, onClose, onSaved }: ModalPlanifierProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    zoneCollecteId: planning?.zone_collecte_id?.toString() ?? "",
    agentId: planning?.agent_id?.toString() ?? "",
    dateCollecte: planning?.date_collecte ?? toIso(new Date()),
    heureDebut: planning?.heure_debut?.slice(0, 5) ?? "07:00",
    heureFin: planning?.heure_fin?.slice(0, 5) ?? "17:00",
    villagesPrevus: planning?.villages_prevus?.join(", ") ?? "",
    objectifKg: planning?.objectif_kg ?? "",
    nbProducteursPrevus: planning?.nb_producteurs_prevus?.toString() ?? "",
    observations: planning?.observations ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        zoneCollecteId: parseInt(form.zoneCollecteId, 10),
        agentId: form.agentId ? parseInt(form.agentId, 10) : undefined,
        dateCollecte: form.dateCollecte,
        heureDebut: form.heureDebut,
        heureFin: form.heureFin,
        villagesPrevus: form.villagesPrevus.split(",").map((v) => v.trim()).filter(Boolean),
        objectifKg: form.objectifKg ? parseFloat(form.objectifKg) : 0,
        nbProducteursPrevus: form.nbProducteursPrevus ? parseInt(form.nbProducteursPrevus, 10) : 0,
        observations: form.observations || undefined,
      };
      if (planning) return apiPut(`/planning-collecte/${planning.id}`, body);
      return apiPost("/planning-collecte", body);
    },
    onSuccess: () => {
      toast({ title: planning ? "Planning modifié" : "Planning créé" });
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold">{planning ? "Modifier le planning" : "Planifier une collecte"}</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zone de collecte *</label>
            <select value={form.zoneCollecteId} onChange={field("zoneCollecteId")} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Sélectionner une zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}{z.section ? ` — ${z.section}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent responsable</label>
            <select value={form.agentId} onChange={field("agentId")} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Aucun</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date collecte *</label>
              <input type="date" value={form.dateCollecte} onChange={field("dateCollecte")} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Objectif (kg)</label>
              <input type="number" value={form.objectifKg} onChange={field("objectifKg")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure début</label>
              <input type="time" value={form.heureDebut} onChange={field("heureDebut")} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure fin</label>
              <input type="time" value={form.heureFin} onChange={field("heureFin")} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Villages ciblés</label>
            <input type="text" value={form.villagesPrevus} onChange={field("villagesPrevus")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Village A, Village B, ..." />
            <p className="text-xs text-gray-500 mt-1">Séparer par des virgules</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producteurs prévus</label>
              <input type="number" value={form.nbProducteursPrevus} onChange={field("nbProducteursPrevus")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observations</label>
            <textarea value={form.observations} onChange={field("observations")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.zoneCollecteId || !form.dateCollecte || mutation.isPending}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Zone ───────────────────────────────────────────────────────────────

interface ModalZoneProps {
  zone?: Zone | null;
  agents: Agent[];
  onClose: () => void;
  onSaved: () => void;
}

function ModalZone({ zone, agents, onClose, onSaved }: ModalZoneProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    nom: zone?.nom ?? "",
    section: zone?.section ?? "",
    villages: zone?.villages?.join(", ") ?? "",
    agentResponsableId: zone?.agent_responsable_id?.toString() ?? "",
    objectifTonnageKg: zone?.objectif_tonnage_kg ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        nom: form.nom,
        section: form.section || undefined,
        villages: form.villages.split(",").map((v) => v.trim()).filter(Boolean),
        agentResponsableId: form.agentResponsableId ? parseInt(form.agentResponsableId, 10) : undefined,
        objectifTonnageKg: form.objectifTonnageKg ? parseFloat(form.objectifTonnageKg) : 0,
      };
      if (zone) return apiPut(`/planning-collecte/zones/${zone.id}`, body);
      return apiPost("/planning-collecte/zones", body);
    },
    onSuccess: () => {
      toast({ title: zone ? "Zone modifiée" : "Zone créée" });
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold">{zone ? "Modifier la zone" : "Nouvelle zone de collecte"}</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input value={form.nom} onChange={field("nom")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Zone Tiébissou Nord" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <input value={form.section} onChange={field("section")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Section A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Villages couverts</label>
            <input value={form.villages} onChange={field("villages")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Village A, Village B, ..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent responsable</label>
            <select value={form.agentResponsableId} onChange={field("agentResponsableId")} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Aucun</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Objectif tonnage campagne (kg)</label>
            <input type="number" value={form.objectifTonnageKg} onChange={field("objectifTonnageKg")} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="10000" />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.nom || mutation.isPending}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card planning ────────────────────────────────────────────────────────────

interface PlanningCardProps {
  p: Planning;
  onDemarrer: (id: number) => void;
  onTerminer: (id: number) => void;
  onAnnuler: (id: number) => void;
  onNotifier: (p: Planning) => void;
  onEdit: (p: Planning) => void;
  canPlanifier: boolean;
  canTerminer: boolean;
  canNotifier: boolean;
  loading: number | null;
}

function PlanningCard({ p, onDemarrer, onTerminer, onAnnuler, onNotifier, onEdit, canPlanifier, canTerminer, canNotifier, loading }: PlanningCardProps) {
  const objectif = parseFloat(p.objectif_kg) || 0;
  const realise = parseFloat(p.tonnage_realise_kg) || 0;
  const pct = objectif > 0 ? Math.min(100, Math.round((realise / objectif) * 100)) : 0;
  const isLoading = loading === p.id;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{p.zone_nom ?? "Zone inconnue"}</p>
          {p.zone_section && <p className="text-xs text-gray-500">{p.zone_section}</p>}
        </div>
        <StatutBadge statut={p.statut} />
      </div>

      <div className="space-y-1.5 mb-3">
        {p.agent_nom && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Users className="w-3.5 h-3.5" />
            <span>{p.agent_nom}</span>
          </div>
        )}
        {p.heure_debut && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{p.heure_debut?.slice(0, 5)} – {p.heure_fin?.slice(0, 5)}</span>
          </div>
        )}
        {(p.villages_prevus ?? []).length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{(p.villages_prevus ?? []).join(", ")}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Package className="w-3.5 h-3.5" />
          <span>Objectif : {fmtKg(p.objectif_kg)}</span>
        </div>
      </div>

      {(p.statut === "en_cours" || p.statut === "termine") && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{fmtKg(p.tonnage_realise_kg)}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {p.nb_producteurs_venus} producteur{p.nb_producteurs_venus !== 1 ? "s" : ""} / {p.nb_producteurs_prevus} prévus
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
        {p.statut === "planifie" && canTerminer && (
          <button onClick={() => onDemarrer(p.id)} disabled={isLoading} className="flex items-center gap-1 text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg hover:bg-yellow-100 disabled:opacity-50">
            <PlayCircle className="w-3 h-3" /> Démarrer
          </button>
        )}
        {p.statut === "en_cours" && canTerminer && (
          <button onClick={() => onTerminer(p.id)} disabled={isLoading} className="flex items-center gap-1 text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50">
            <CheckCircle2 className="w-3 h-3" /> Terminer
          </button>
        )}
        {p.statut === "planifie" && canNotifier && (
          <button onClick={() => onNotifier(p)} disabled={isLoading} className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
            <Bell className="w-3 h-3" />
            {p.sms_envoye ? "Re-notifier" : "Notifier"}
          </button>
        )}
        {(p.statut === "planifie" || p.statut === "en_cours") && canPlanifier && (
          <>
            <button onClick={() => onEdit(p)} className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 text-gray-700 border rounded-lg hover:bg-gray-100">
              <Pencil className="w-3 h-3" /> Modifier
            </button>
            <button onClick={() => onAnnuler(p.id)} disabled={isLoading} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
              <XCircle className="w-3 h-3" /> Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Onglet Calendrier ────────────────────────────────────────────────────────

interface OngletCalendrierProps {
  zones: Zone[];
  agents: Agent[];
  role: string;
}

function OngletCalendrier({ zones, agents, role }: OngletCalendrierProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editPlanning, setEditPlanning] = useState<Planning | null>(null);
  const [notifModal, setNotifModal] = useState<Planning | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const monday = getMondayOfWeek(addDays(new Date(), weekOffset * 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const semaineParam = toIso(monday);

  const canPlanifier = ["pca", "directeur", "responsable_tracabilite"].includes(role);
  const canTerminer  = ["pca", "directeur", "responsable_tracabilite", "delegue"].includes(role);
  const canNotifier  = ["pca", "directeur"].includes(role);

  const { data: plannings = [], refetch } = useQuery<Planning[]>({
    queryKey: ["planning-semaine", semaineParam],
    queryFn: () => apiFetch(`/planning-collecte?semaine=${semaineParam}`),
  });

  async function action(id: number, endpoint: string, msg: string) {
    setLoadingId(id);
    try {
      await apiPut(`/planning-collecte/${id}/${endpoint}`, {});
      toast({ title: msg });
      void refetch();
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }

  async function confirmNotifier(p: Planning) {
    setNotifModal(null);
    setLoadingId(p.id);
    try {
      const result = await apiPost<{ envoyes: number; echecs: number; nbMembres: number }>(`/planning-collecte/${p.id}/notifier`, {});
      toast({ title: `${result.envoyes} SMS envoyé${result.envoyes !== 1 ? "s" : ""}`, description: result.echecs > 0 ? `${result.echecs} échec(s)` : "Tous envoyés" });
      void refetch();
    } catch (err) {
      toast({ title: "Erreur SMS", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }

  const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div>
      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset((n) => n - 1)} className="p-2 rounded-lg border hover:bg-gray-50">←</button>
          <span className="text-sm font-medium">
            {monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} – {addDays(monday, 6).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setWeekOffset((n) => n + 1)} className="p-2 rounded-lg border hover:bg-gray-50">→</button>
          <button onClick={() => setWeekOffset(0)} className="text-xs text-green-700 underline">Cette semaine</button>
        </div>
        {canPlanifier && (
          <button onClick={() => { setEditPlanning(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800">
            <Plus className="w-4 h-4" /> Planifier une collecte
          </button>
        )}
      </div>

      {/* Grille semaine */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, idx) => {
          const isoDay = toIso(day);
          const isToday = isoDay === toIso(new Date());
          const dayPlannings = plannings.filter((p) => p.date_collecte === isoDay);
          return (
            <div key={isoDay} className="min-h-[200px]">
              <div className={`text-center p-2 rounded-t-lg text-sm font-semibold mb-1 ${isToday ? "bg-green-700 text-white" : "bg-gray-100 text-gray-700"}`}>
                <div>{DAY_NAMES[idx]}</div>
                <div className="text-lg">{day.getDate()}</div>
              </div>
              <div className="space-y-2">
                {dayPlannings.map((p) => (
                  <PlanningCard
                    key={p.id}
                    p={p}
                    onDemarrer={(id) => action(id, "demarrer", "Collecte démarrée")}
                    onTerminer={(id) => action(id, "terminer", "Collecte terminée")}
                    onAnnuler={(id) => action(id, "annuler", "Collecte annulée")}
                    onNotifier={(pl) => setNotifModal(pl)}
                    onEdit={(pl) => { setEditPlanning(pl); setShowModal(true); }}
                    canPlanifier={canPlanifier}
                    canTerminer={canTerminer}
                    canNotifier={canNotifier}
                    loading={loadingId}
                  />
                ))}
                {dayPlannings.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-2">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <ModalPlanifier
          zones={zones}
          agents={agents}
          planning={editPlanning}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["planning-semaine"] })}
        />
      )}

      {notifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-3">Confirmer l'envoi SMS</h2>
            <p className="text-sm text-gray-600 mb-4">
              Envoyer une notification SMS à tous les membres actifs de la zone <strong>{notifModal.zone_nom}</strong> pour la collecte du <strong>{fmtDate(notifModal.date_collecte)}</strong> ?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setNotifModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={() => confirmNotifier(notifModal)} className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
                Envoyer SMS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Suivi temps réel ──────────────────────────────────────────────────

function OngletSuivi({ role }: { role: string }) {
  const { toast } = useToast();
  const today = toIso(new Date());
  const canTerminer = ["pca", "directeur", "responsable_tracabilite", "delegue"].includes(role);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: plannings = [], refetch, isFetching } = useQuery<Planning[]>({
    queryKey: ["planning-today", today],
    queryFn: () => apiFetch(`/planning-collecte?semaine=${today}`),
    refetchInterval: 60_000, // refresh chaque minute
  });

  const todayPlannings = plannings.filter((p) => p.date_collecte === today);

  async function terminer(id: number) {
    setLoadingId(id);
    try {
      await apiPut(`/planning-collecte/${id}/terminer`, {});
      toast({ title: "Collecte clôturée", description: "Rapport SMS envoyé au directeur" });
      void refetch();
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Collectes du jour</h3>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <button onClick={() => void refetch()} disabled={isFetching} className="flex items-center gap-1.5 text-sm text-gray-600 border px-3 py-1.5 rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {todayPlannings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune collecte planifiée aujourd'hui</p>
        </div>
      ) : (
        <div className="space-y-4">
          {todayPlannings.map((p) => {
            const objectif = parseFloat(p.objectif_kg) || 0;
            const realise = parseFloat(p.tonnage_realise_kg) || 0;
            const pct = objectif > 0 ? Math.min(100, Math.round((realise / objectif) * 100)) : 0;
            return (
              <div key={p.id} className="bg-white border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-gray-900">{p.zone_nom ?? "Zone inconnue"}</h4>
                    {p.agent_nom && <p className="text-sm text-gray-600">Agent : {p.agent_nom}</p>}
                    {p.heure_debut && <p className="text-xs text-gray-500">{p.heure_debut?.slice(0, 5)} – {p.heure_fin?.slice(0, 5)}</p>}
                  </div>
                  <StatutBadge statut={p.statut} />
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{fmtKg(p.tonnage_realise_kg)}</span>
                    <span className="text-gray-500">Objectif : {fmtKg(p.objectif_kg)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{p.nb_producteurs_venus} producteur{p.nb_producteurs_venus !== 1 ? "s" : ""} venus sur {p.nb_producteurs_prevus} prévus</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>

                {(p.villages_prevus ?? []).length > 0 && (
                  <p className="text-xs text-gray-500 mb-3">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {(p.villages_prevus ?? []).join(", ")}
                  </p>
                )}

                {canTerminer && p.statut === "en_cours" && (
                  <button
                    onClick={() => terminer(p.id)}
                    disabled={loadingId === p.id}
                    className="flex items-center gap-2 text-sm px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {loadingId === p.id ? "Clôture en cours..." : "Terminer la collecte"}
                  </button>
                )}
                {canTerminer && p.statut === "planifie" && (
                  <button
                    onClick={async () => {
                      setLoadingId(p.id);
                      try {
                        await apiPut(`/planning-collecte/${p.id}/demarrer`, {});
                        toast({ title: "Collecte démarrée" });
                        void refetch();
                      } finally { setLoadingId(null); }
                    }}
                    disabled={loadingId === p.id}
                    className="flex items-center gap-2 text-sm px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                  >
                    <PlayCircle className="w-4 h-4" /> Démarrer la collecte
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Onglet Zones & Agents ────────────────────────────────────────────────────

interface OngletZonesProps {
  zones: Zone[];
  agents: Agent[];
  refetchZones: () => void;
  role: string;
}

function OngletZones({ zones, agents, refetchZones, role }: OngletZonesProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editZone, setEditZone] = useState<Zone | null>(null);

  const canGererZones = ["pca", "directeur"].includes(role);

  const { data: statsZones = [] } = useQuery<ZoneStat[]>({
    queryKey: ["stats-zones"],
    queryFn: () => apiFetch("/planning-collecte/zones/stats"),
  });

  const statsMap = Object.fromEntries(statsZones.map((s) => [s.zoneId, s]));

  async function supprimerZone(id: number) {
    if (!confirm("Supprimer cette zone ? Les plannings associés resteront.")) return;
    try {
      await apiDelete(`/planning-collecte/zones/${id}`);
      toast({ title: "Zone supprimée" });
      refetchZones();
      void qc.invalidateQueries({ queryKey: ["stats-zones"] });
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Zones de collecte</h3>
        {canGererZones && (
          <button onClick={() => { setEditZone(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800">
            <Plus className="w-4 h-4" /> Nouvelle zone
          </button>
        )}
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune zone définie</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zones.map((z) => {
            const st = statsMap[z.id];
            const taux = st?.tauxRealisation ?? 0;
            const agentNom = agents.find((a) => a.id === z.agent_responsable_id)?.nom;
            return (
              <div key={z.id} className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{z.nom}</h4>
                    {z.section && <p className="text-xs text-gray-500">{z.section}</p>}
                  </div>
                  {canGererZones && (
                    <div className="flex gap-1.5">
                      <button onClick={() => { setEditZone(z); setShowModal(true); }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => supprimerZone(z.id)} className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {agentNom && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                    <Users className="w-3.5 h-3.5" />
                    <span>{agentNom}</span>
                  </div>
                )}

                {(z.villages ?? []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Villages :</p>
                    <div className="flex flex-wrap gap-1">
                      {(z.villages ?? []).map((v) => (
                        <span key={v} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{v}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">Objectif campagne</p>
                    <p className="font-semibold">{fmtKg(z.objectif_tonnage_kg)}</p>
                  </div>
                  {st && (
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-500">Réalisé</p>
                      <p className="font-semibold">{fmtKg(st.tonnageRealise)}</p>
                    </div>
                  )}
                </div>

                {st && st.tonnagePrevu > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Taux de réalisation</span>
                      <span className="font-semibold">{taux}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${taux >= 100 ? "bg-green-500" : taux >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ width: `${Math.min(100, taux)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{st.nbPlannings} collecte{st.nbPlannings !== 1 ? "s" : ""}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ModalZone
          zone={editZone}
          agents={agents}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            refetchZones();
            void qc.invalidateQueries({ queryKey: ["stats-zones"] });
          }}
        />
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PlanningCollectePage() {
  const { utilisateur } = useAuth();
  const role = utilisateur?.role ?? "delegue";
  const [tab, setTab] = useState<"calendrier" | "suivi" | "zones">("calendrier");

  const { data: zones = [], refetch: refetchZones } = useQuery<Zone[]>({
    queryKey: ["planning-zones"],
    queryFn: () => apiFetch("/planning-collecte/zones"),
  });

  const { data: allUsers = [] } = useQuery<Agent[]>({
    queryKey: ["users-all"],
    queryFn: () => apiFetch("/users"),
  });
  const agents = allUsers.filter((u) => u.role === "terrain");

  const { data: stats } = useQuery<Stats>({
    queryKey: ["planning-stats"],
    queryFn: () => apiFetch("/planning-collecte/stats"),
  });

  const TABS = [
    { id: "calendrier" as const, label: "Calendrier", icon: CalendarDays },
    { id: "suivi"      as const, label: "Suivi en temps réel", icon: TrendingUp },
    { id: "zones"      as const, label: "Zones & agents", icon: MapPin },
  ];

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-xl">
            <ClipboardList className="w-6 h-6 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Planification des collectes</h1>
            <p className="text-sm text-gray-500">Organisation et suivi des collectes de cacao</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Total plannings</p>
            <p className="text-2xl font-bold text-gray-900">{stats.nbPlannings}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Tonnage prévu</p>
            <p className="text-2xl font-bold text-gray-900">{(stats.tonnagePrevu / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} t</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Tonnage réalisé</p>
            <p className="text-2xl font-bold text-green-700">{(stats.tonnageRealise / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} t</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Taux de réalisation</p>
            <p className="text-2xl font-bold text-gray-900">{stats.tauxRealisationPct}%</p>
            {stats.agentPlusActif && <p className="text-xs text-gray-400 mt-0.5">Meilleur : {stats.agentPlusActif}</p>}
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-green-700 text-green-700 bg-green-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "calendrier" && (
            <OngletCalendrier zones={zones} agents={agents} role={role} />
          )}
          {tab === "suivi" && (
            <OngletSuivi role={role} />
          )}
          {tab === "zones" && (
            <OngletZones zones={zones} agents={agents} refetchZones={() => void refetchZones()} role={role} />
          )}
        </div>
      </div>
    </div>
  );
}
