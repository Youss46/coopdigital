import { useState, useRef, useEffect, type ReactNode } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, MapPin, Users, Calendar, CheckCircle,
  XCircle, Clock, Target, Loader2, AlertTriangle, Eye, Map, List, Download,
  MessageCircle, Send, Image, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import MissionCarteGPS from "@/components/MissionCarteGPS";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MembreMission {
  missionMembreId: number;
  membreId: number;
  statut: string;
  gpsCollecte: unknown;
  photosCollectees: unknown;
  notesAgent: string | null;
  dateCollecte: string | null;
  motifRejet: string | null;
  nom: string;
  prenoms: string;
  village: string | null;
  telephone: string;
  gpsParcelles: unknown;
  nombreParcelles: number | null;
}

interface MissionDetail {
  id: number;
  titre: string;
  zoneType: string;
  zoneNom: string;
  datePrevue: string;
  statut: string;
  objectifParcelles: number | null;
  parcellesCollectees: number | null;
  agentId: number | null;
  notes: string | null;
  motifRejet: string | null;
  createdAt: string;
  membres: MembreMission[];
}

interface Message {
  id: number;
  message: string;
  type: string;
  lu: boolean;
  createdAt: string;
  auteurId: number | null;
  auteurNom: string | null;
  auteurPrenoms: string | null;
  auteurRole: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) } });

const STATUT_CFG: Record<string, { label: string; color: string; icon: ReactNode }> = {
  a_faire:    { label: "À faire",    color: "text-gray-500 bg-gray-100", icon: <Clock size={11} /> },
  en_attente: { label: "En attente", color: "text-gray-500 bg-gray-100", icon: <Clock size={11} /> },
  collecte:   { label: "Collecté",   color: "text-blue-700 bg-blue-100", icon: <MapPin size={11} /> },
  valide:     { label: "Validé ✓",   color: "text-green-700 bg-green-100", icon: <CheckCircle size={11} /> },
  rejete:     { label: "Rejeté",     color: "text-red-700 bg-red-100", icon: <XCircle size={11} /> },
};

function BadgeStatutMembre({ statut }: { statut: string }) {
  const cfg = STATUT_CFG[statut] ?? { label: statut, color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

const MISSION_STATUT: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée",  color: "bg-blue-100 text-blue-700" },
  en_cours:  { label: "En cours",  color: "bg-orange-100 text-orange-700" },
  soumise:   { label: "À valider", color: "bg-yellow-100 text-yellow-700" },
  validee:   { label: "Validée",   color: "bg-green-100 text-green-700" },
  rejetee:   { label: "Rejetée",   color: "bg-red-100 text-red-700" },
};

function parsePhotos(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string") as string[];
  return [];
}

function isSignedUrl(url: string): boolean {
  return url.startsWith("http") || url.startsWith("/");
}

// ── Photo gallery modal ───────────────────────────────────────────────────────

function PhotoGallery({ photos, nomMembre, onClose }: { photos: string[]; nomMembre: string; onClose: () => void }) {
  const [idx, setIdx] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-medium text-sm">{nomMembre} — Photo {idx + 1}/{photos.length}</p>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <img
          src={isSignedUrl(photos[idx] ?? "") ? photos[idx] : `data:image/jpeg;base64,${photos[idx]}`}
          alt={`Photo ${idx + 1}`}
          className="w-full rounded-xl max-h-[70vh] object-contain bg-black"
          onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
        />
        {photos.length > 1 && (
          <div className="flex justify-center gap-2 mt-3">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/40"}`}
              />
            ))}
          </div>
        )}
        {photos.length > 1 && (
          <div className="flex justify-between mt-3">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm disabled:opacity-30"
            >
              ← Précédent
            </button>
            <button
              onClick={() => setIdx((i) => Math.min(photos.length - 1, i + 1))}
              disabled={idx === photos.length - 1}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm disabled:opacity-30"
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Messaging panel ───────────────────────────────────────────────────────────

function MessagingPanel({ missionId, userId }: { missionId: string; userId: number }) {
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["mission-messages", missionId],
    queryFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/messages`);
      if (!r.ok) return [];
      return r.json() as Promise<Message[]>;
    },
    enabled: ouvert,
    refetchInterval: ouvert ? 15000 : false,
  });

  useEffect(() => {
    if (ouvert && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, ouvert]);

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: texte.trim() }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      setTexte("");
      void queryClient.invalidateQueries({ queryKey: ["mission-messages", missionId] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const nonLus = messages.filter((m) => !m.lu && m.auteurId !== userId).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOuvert((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-blue-600" />
          <span className="font-semibold text-gray-800 text-sm">Messagerie avec l'agent</span>
          {nonLus > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{nonLus}</span>
          )}
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">({messages.length} message{messages.length > 1 ? "s" : ""})</span>
          )}
        </div>
        {ouvert ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {ouvert && (
        <div className="border-t border-gray-100">
          {/* Liste des messages */}
          <div className="px-4 py-3 max-h-72 overflow-y-auto space-y-3 bg-gray-50">
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
            ) : messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">Aucun message. Commencez la conversation avec l'agent.</p>
            ) : (
              messages.map((msg) => {
                const estMoi = msg.auteurId === userId;
                const estProbleme = msg.type === "probleme";
                return (
                  <div key={msg.id} className={`flex ${estMoi ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm
                      ${estProbleme ? "bg-red-50 border border-red-200 text-red-800" :
                        estMoi ? "bg-green-700 text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                      {!estMoi && (
                        <p className={`text-[10px] font-semibold mb-0.5 ${estProbleme ? "text-red-600" : "text-gray-500"}`}>
                          {msg.auteurPrenoms} {msg.auteurNom}
                          {msg.auteurRole === "agent_terrain" ? " · Agent" : " · RT"}
                          {estProbleme && " · ⚠ Problème"}
                        </p>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${estMoi ? "text-green-200" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Zone de saisie */}
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && texte.trim()) { e.preventDefault(); envoyer.mutate(); } }}
              placeholder="Écrire un message à l'agent…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              disabled={envoyer.isPending}
            />
            <button
              onClick={() => { if (texte.trim()) envoyer.mutate(); }}
              disabled={!texte.trim() || envoyer.isPending}
              className="p-2 bg-green-700 text-white rounded-xl hover:bg-green-800 disabled:opacity-40 transition-colors"
            >
              {envoyer.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/missions/:id");
  const missionId = params?.id ?? "";
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();
  const peutValider = usePermission("missions", "valider");
  const estAgent = utilisateur?.role === "agent_terrain";
  const { toast } = useToast();

  const [modalRejet, setModalRejet] = useState<{ membreId: number; nom: string } | null>(null);
  const [motifRejet, setMotifRejet] = useState("");
  const [modalRejetMission, setModalRejetMission] = useState(false);
  const [motifRejetMission, setMotifRejetMission] = useState("");
  const [modalRejetTout, setModalRejetTout] = useState(false);
  const [motifRejetTout, setMotifRejetTout] = useState("");
  const [vue, setVue] = useState<"liste" | "carte">("liste");
  const [galerie, setGalerie] = useState<{ photos: string[]; nom: string } | null>(null);
  const [membreExpanded, setMembreExpanded] = useState<number | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: mission, isLoading } = useQuery<MissionDetail>({
    queryKey: ["mission-detail", missionId],
    queryFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}`);
      if (!r.ok) throw new Error("Mission introuvable");
      return r.json() as Promise<MissionDetail>;
    },
    enabled: !!missionId,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const valider = useMutation({
    mutationFn: async (membreId: number) => {
      const r = await apiFetch(`/api/missions/${missionId}/membres/${membreId}/valider`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rejeter = useMutation({
    mutationFn: async ({ membreId, motif }: { membreId: number; motif: string }) => {
      const r = await apiFetch(`/api/missions/${missionId}/membres/${membreId}/rejeter`, { method: "POST", body: JSON.stringify({ motif }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => {
      setModalRejet(null);
      setMotifRejet("");
      void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const validerMission = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/valider`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rejeterMission = useMutation({
    mutationFn: async (motif: string) => {
      const r = await apiFetch(`/api/missions/${missionId}/rejeter`, { method: "POST", body: JSON.stringify({ motif }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => {
      setModalRejetMission(false);
      setMotifRejetMission("");
      void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const validerTout = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/valider-tout`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json() as Promise<{ ok: boolean; valides: number }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
      toast({ title: `${data.valides} collecte${data.valides > 1 ? "s" : ""} GPS validée${data.valides > 1 ? "s" : ""} avec succès.` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rejeterTout = useMutation({
    mutationFn: async (motif: string) => {
      const r = await apiFetch(`/api/missions/${missionId}/rejeter-tout`, { method: "POST", body: JSON.stringify({ motif }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json() as Promise<{ ok: boolean; rejetes: number }>;
    },
    onSuccess: (data) => {
      setModalRejetTout(false);
      setMotifRejetTout("");
      void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
      toast({ title: `${data.rejetes} collecte${data.rejetes > 1 ? "s" : ""} GPS rejetée${data.rejetes > 1 ? "s" : ""}.` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const demarrer = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/demarrer`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const soumettre = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/missions/${missionId}/soumettre`, { method: "POST" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mission-detail", missionId] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Export GeoJSON ────────────────────────────────────────────────────────

  async function handleExportGeoJSON() {
    const r = await apiFetch(`/api/missions/${missionId}/export-geojson`);
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gps_terrain_mission_${missionId}_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Stats rapides ─────────────────────────────────────────────────────────

  const stats = mission ? {
    total:     mission.membres.length,
    valides:   mission.membres.filter((m) => m.statut === "valide").length,
    collectes: mission.membres.filter((m) => m.statut === "collecte").length,
    rejetes:   mission.membres.filter((m) => m.statut === "rejete").length,
    enAttente: mission.membres.filter((m) => ["a_faire", "en_attente"].includes(m.statut)).length,
  } : null;

  const progression = stats && stats.total > 0 ? Math.round((stats.valides / stats.total) * 100) : 0;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  );

  if (!mission) return (
    <div className="text-center py-24">
      <AlertTriangle size={32} className="mx-auto text-gray-300 mb-3" />
      <p className="text-gray-500">Mission introuvable</p>
      <button onClick={() => navigate("/missions")} className="mt-4 text-sm text-blue-600 hover:underline">Retour aux missions</button>
    </div>
  );

  const mStatut = MISSION_STATUT[mission.statut] ?? { label: mission.statut, color: "bg-gray-100 text-gray-600" };
  const peutValiderMission = peutValider && mission.statut === "soumise" && !estAgent;

  return (
    <div className="space-y-5">

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/missions")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mt-1">
            <ChevronLeft size={16} />Missions
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{mission.titre}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${mStatut.color}`}>{mStatut.label}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1"><MapPin size={13} />{mission.zoneNom} ({mission.zoneType})</span>
              <span className="flex items-center gap-1"><Calendar size={13} />{new Date(mission.datePrevue).toLocaleDateString("fr-FR")}</span>
              {stats && <span className="flex items-center gap-1"><Users size={13} />{stats.total} membres</span>}
            </div>
          </div>
        </div>

        {/* Actions mission */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Toggle liste / carte */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setVue("liste")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${vue === "liste" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
              <List size={14} />Liste
            </button>
            <button
              onClick={() => setVue("carte")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-200 ${vue === "carte" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
              <Map size={14} />Carte GPS
            </button>
          </div>
          {stats && (stats.collectes + stats.valides) > 0 && (
            <button
              onClick={handleExportGeoJSON}
              title="Télécharger les polygones GPS de cette mission en GeoJSON EUDR"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-green-600 text-green-700 text-sm rounded-lg hover:bg-green-50 transition-colors"
            >
              <Download size={14} />
              GeoJSON
            </button>
          )}
          {estAgent && mission.statut === "planifiee" && (
            <button onClick={() => demarrer.mutate()} disabled={demarrer.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {demarrer.isPending ? "…" : "Démarrer la mission"}
            </button>
          )}
          {estAgent && mission.statut === "en_cours" && (
            <button onClick={() => soumettre.mutate()} disabled={soumettre.isPending}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {soumettre.isPending ? "…" : "Soumettre pour validation"}
            </button>
          )}
          {/* Boutons RT : lot valider / rejeter toutes les collectes */}
          {peutValiderMission && stats && stats.collectes > 0 && (
            <>
              <button
                onClick={() => {
                  if (window.confirm(`Valider les ${stats.collectes} collecte${stats.collectes > 1 ? "s" : ""} GPS en attente ? Les données seront intégrées dans les fiches membres.`)) {
                    validerTout.mutate();
                  }
                }}
                disabled={validerTout.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {validerTout.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle size={14} />}
                Valider tout ({stats.collectes})
              </button>
              <button
                onClick={() => { setModalRejetTout(true); setMotifRejetTout(""); }}
                disabled={rejeterTout.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={14} />
                Rejeter tout ({stats.collectes})
              </button>
            </>
          )}
          {/* Boutons RT : Valider / Rejeter la mission entière */}
          {peutValiderMission && (
            <>
              <button
                onClick={() => validerMission.mutate()}
                disabled={validerMission.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {validerMission.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Valider la mission
              </button>
              <button
                onClick={() => { setModalRejetMission(true); setMotifRejetMission(""); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                <XCircle size={14} />Rejeter
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Motif de rejet mission ────────────────────────────────────────────── */}
      {mission.statut === "rejetee" && mission.motifRejet && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Mission rejetée : </span>{mission.motifRejet}
        </div>
      )}

      {/* ── Notes ────────────────────────────────────────────────────────────── */}
      {mission.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Notes : </span>{mission.notes}
        </div>
      )}

      {/* ── Statistiques ─────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "bg-gray-50 text-gray-700" },
            { label: "Validés", value: stats.valides, color: "bg-green-50 text-green-700" },
            { label: "À valider", value: stats.collectes, color: "bg-blue-50 text-blue-700" },
            { label: "Rejetés", value: stats.rejetes, color: "bg-red-50 text-red-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-4 text-center ${color}`}>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Barre progression validations */}
      {stats && stats.total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progression validation</span>
            <span>{progression}% ({stats.valides}/{stats.total})</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${progression === 100 ? "bg-green-500" : "bg-blue-400"}`}
              style={{ width: `${progression}%` }} />
          </div>
        </div>
      )}

      {/* ── Vue carte GPS ────────────────────────────────────────────────────── */}
      {vue === "carte" && (
        <MissionCarteGPS
          membres={mission.membres}
          hauteur="460px"
          peutValider={peutValider && mission.statut === "soumise"}
          onValider={(id) => valider.mutate(id)}
          onRejeter={(id, nom) => setModalRejet({ membreId: id, nom })}
        />
      )}

      {/* ── Liste des membres ─────────────────────────────────────────────────── */}
      {vue === "liste" && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Membres de la mission</h2>
          {peutValider && stats && stats.collectes > 0 && mission.statut === "soumise" && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded-lg">
              {stats.collectes} collecte{stats.collectes > 1 ? "s" : ""} à valider
            </p>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {mission.membres.length === 0 ? (
            <div className="text-center text-gray-400 py-8">Aucun membre dans cette mission</div>
          ) : mission.membres.map((m) => {
            const photos = parsePhotos(m.photosCollectees);
            const isExpanded = membreExpanded === m.membreId;

            return (
              <div key={m.membreId} className="hover:bg-gray-50 transition-colors">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 text-sm">{m.prenoms} {m.nom}</p>
                        <BadgeStatutMembre statut={m.statut} />
                        {photos.length > 0 && (
                          <button
                            onClick={() => setGalerie({ photos, nom: `${m.prenoms} ${m.nom}` })}
                            className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded-full"
                          >
                            <Image size={9} />{photos.length} photo{photos.length > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                        {m.village && <span>{m.village}</span>}
                        {m.telephone && <span>{m.telephone}</span>}
                        {m.nombreParcelles && <span>{m.nombreParcelles} parcelle{m.nombreParcelles > 1 ? "s" : ""}</span>}
                        {m.dateCollecte && (
                          <span>Collecté le {new Date(m.dateCollecte).toLocaleDateString("fr-FR")}</span>
                        )}
                      </div>
                      {m.notesAgent && (
                        <p className="text-xs text-blue-600 mt-0.5">Agent : {m.notesAgent}</p>
                      )}
                      {m.motifRejet && (
                        <p className="text-xs text-red-600 mt-0.5">Motif : {m.motifRejet}</p>
                      )}
                      {/* GPS collecté */}
                      {!!m.gpsCollecte && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <MapPin size={10} className="text-green-600" />
                          <span className="text-xs text-green-700">
                            {Array.isArray(m.gpsCollecte)
                              ? `${(m.gpsCollecte as unknown[]).length} point${(m.gpsCollecte as unknown[]).length > 1 ? "s" : ""} GPS`
                              : typeof m.gpsCollecte === "object" && m.gpsCollecte !== null
                                ? `${(m.gpsCollecte as { lat?: number }).lat?.toFixed(4) ?? "?"}, ${((m.gpsCollecte as { lng?: number; lon?: number }).lng ?? (m.gpsCollecte as { lon?: number }).lon)?.toFixed(4) ?? "?"}`
                                : "GPS collecté"}
                          </span>
                          <button
                            onClick={() => setVue("carte")}
                            className="text-[10px] text-blue-500 hover:text-blue-700 underline">
                            Voir sur carte
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions RT */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => navigate(`/membres/${m.membreId}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Voir la fiche">
                        <Eye size={14} />
                      </button>
                      {photos.length > 0 && (
                        <button
                          onClick={() => setMembreExpanded(isExpanded ? null : m.membreId)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                          title="Photos"
                        >
                          <Image size={14} />
                        </button>
                      )}
                      {peutValider && m.statut === "collecte" && (
                        <>
                          <button
                            disabled={valider.isPending}
                            onClick={() => valider.mutate(m.membreId)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                            <CheckCircle size={12} />Valider
                          </button>
                          <button
                            onClick={() => { setModalRejet({ membreId: m.membreId, nom: `${m.prenoms} ${m.nom}` }); setMotifRejet(""); }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">
                            <XCircle size={12} />Rejeter
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Miniatures photos (accordéon) */}
                  {isExpanded && photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {photos.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => setGalerie({ photos, nom: `${m.prenoms} ${m.nom}` })}
                          className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-400"
                        >
                          <img
                            src={isSignedUrl(p) ? p : `data:image/jpeg;base64,${p}`}
                            alt={`Photo ${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).parentElement!.style.display = "none";
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>}

      {/* ── Messagerie ────────────────────────────────────────────────────────── */}
      {!estAgent && utilisateur?.id && (
        <MessagingPanel missionId={missionId} userId={utilisateur.id} />
      )}

      {/* ── Modal rejet parcelle ─────────────────────────────────────────────── */}
      {modalRejet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Rejeter la collecte GPS</h3>
              <p className="text-sm text-gray-500 mt-0.5">{modalRejet.nom}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-gray-600">Motif de rejet *</label>
              <textarea value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} rows={3}
                placeholder="Ex: Coordonnées GPS inexactes, polygone incomplet…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
              <div className="flex gap-3">
                <button onClick={() => setModalRejet(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!motifRejet.trim() || rejeter.isPending}
                  onClick={() => rejeter.mutate({ membreId: modalRejet.membreId, motif: motifRejet })}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  {rejeter.isPending ? "…" : "Confirmer le rejet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal rejet de la mission entière ────────────────────────────────── */}
      {modalRejetMission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Rejeter la mission</h3>
              <p className="text-sm text-gray-500 mt-0.5">{mission.titre}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-600">L'agent sera notifié et devra corriger et resoumettre la mission.</p>
              <label className="block text-xs font-medium text-gray-600 mt-2">Motif de rejet *</label>
              <textarea
                value={motifRejetMission}
                onChange={(e) => setMotifRejetMission(e.target.value)}
                rows={3}
                placeholder="Ex: Plusieurs polygones incorrects, photos manquantes pour certains membres…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              />
              <div className="flex gap-3">
                <button onClick={() => setModalRejetMission(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!motifRejetMission.trim() || rejeterMission.isPending}
                  onClick={() => rejeterMission.mutate(motifRejetMission)}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  {rejeterMission.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Rejeter la mission"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal rejet en lot (Rejeter tout) ─────────────────────────────────── */}
      {modalRejetTout && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Rejeter toutes les collectes</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {stats && stats.collectes > 0
                  ? `${stats.collectes} collecte${stats.collectes > 1 ? "s" : ""} GPS en attente`
                  : mission.titre}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-600">
                Toutes les collectes en statut « À valider » seront rejetées avec ce motif commun. L'agent terrain sera notifié.
              </p>
              <label className="block text-xs font-medium text-gray-600 mt-2">Motif de rejet commun *</label>
              <textarea
                value={motifRejetTout}
                onChange={(e) => setMotifRejetTout(e.target.value)}
                rows={3}
                placeholder="Ex: Signal GPS insuffisant lors de la session, zone incorrecte, données incohérentes…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setModalRejetTout(false); setMotifRejetTout(""); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  disabled={!motifRejetTout.trim() || rejeterTout.isPending}
                  onClick={() => rejeterTout.mutate(motifRejetTout)}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  {rejeterTout.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Rejeter tout"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Galerie photos plein écran ─────────────────────────────────────────── */}
      {galerie && (
        <PhotoGallery
          photos={galerie.photos}
          nomMembre={galerie.nom}
          onClose={() => setGalerie(null)}
        />
      )}
    </div>
  );
}
