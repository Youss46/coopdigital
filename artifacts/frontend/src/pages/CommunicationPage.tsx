import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Inbox, CheckCircle, Clock, Users, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } });
const apiPost = (url: string, body: unknown) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
    body: JSON.stringify(body),
  });
const apiPut = (url: string) =>
  fetch(`${BASE}${url}`, { method: "PUT", headers: { Authorization: `Bearer ${tok()}` } });

const VERT = "#1a4731";

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const DESTINATAIRES_OPTIONS = [
  { value: "tous",                   label: "Tous les utilisateurs" },
  { value: "direction",              label: "Direction (PCA, Directeur, Comptable)" },
  { value: "agent_terrain",          label: "Agents terrain" },
  { value: "delegue",                label: "Délégués" },
  { value: "magasinier",             label: "Magasiniers" },
  { value: "responsable_tracabilite",label: "Responsables traçabilité" },
  { value: "auditeur",               label: "Auditeurs" },
];

interface MessageEnvoye {
  id: number;
  sujet: string;
  contenu: string;
  destinataires: string;
  nbDestinataires: number;
  createdAt: string;
  auteurNom: string;
}

interface MessageRecu {
  id: number;
  sujet: string;
  contenu: string;
  destinataires: string;
  createdAt: string;
  auteurNom: string;
  lu: boolean;
}

// ─── Onglet Composer ──────────────────────────────────────────────────────────

function TabComposer({ onSuccess }: { onSuccess: () => void }) {
  const [sujet, setSujet] = useState("");
  const [contenu, setContenu] = useState("");
  const [destinataires, setDestinataires] = useState("tous");
  const [confirmation, setConfirmation] = useState<{ id: number; nb: number } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiPost("/api/communication/messages", { sujet, contenu, destinataires });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ erreur: `Erreur ${r.status}` })) as { erreur: string };
        throw new Error(e.erreur);
      }
      return r.json() as Promise<{ id: number; nbDestinataires: number }>;
    },
    onSuccess: (data) => {
      setConfirmation({ id: data.id, nb: data.nbDestinataires });
      setSujet("");
      setContenu("");
      setDestinataires("tous");
      onSuccess();
    },
  });

  const destLabel = DESTINATAIRES_OPTIONS.find((d) => d.value === destinataires)?.label ?? destinataires;

  return (
    <div className="space-y-5">
      {confirmation && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">
              Message envoyé à {confirmation.nb} utilisateur{confirmation.nb > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Une notification push a été envoyée à chaque destinataire connecté.
            </p>
          </div>
          <button onClick={() => setConfirmation(null)} className="text-green-400 hover:text-green-600 text-xs">✕</button>
        </div>
      )}

      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {(mutation.error as Error).message}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Destinataires</label>
        <select
          value={destinataires}
          onChange={(e) => setDestinataires(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
        >
          {DESTINATAIRES_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Users size={11} /> {destLabel}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Sujet</label>
        <input
          type="text"
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
          maxLength={120}
          placeholder="Ex : Réunion du conseil — vendredi 9h"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          rows={6}
          placeholder="Rédigez votre message ici…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
        />
      </div>

      {sujet.trim() && contenu.trim() && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aperçu</p>
          <p className="text-sm font-semibold text-gray-900">{sujet}</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{contenu}</p>
        </div>
      )}

      <button
        onClick={() => mutation.mutate()}
        disabled={!sujet.trim() || !contenu.trim() || mutation.isPending}
        className="w-full py-3 text-white rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: VERT }}
      >
        <Send size={15} />
        {mutation.isPending ? "Envoi en cours…" : "Envoyer le message"}
      </button>
    </div>
  );
}

// ─── Carte message ─────────────────────────────────────────────────────────────

function MessageCard({ msg, onLu }: { msg: MessageRecu; onLu: (id: number) => void }) {
  const [ouvert, setOuvert] = useState(false);

  const handleOpen = () => {
    setOuvert((v) => !v);
    if (!msg.lu) onLu(msg.id);
  };

  return (
    <div
      className={`border rounded-xl transition-colors cursor-pointer ${msg.lu ? "border-gray-100 bg-white" : "border-green-200 bg-green-50"}`}
    >
      <div
        className="px-4 py-3 flex items-start gap-3"
        onClick={handleOpen}
      >
        {!msg.lu && <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />}
        {msg.lu && <span className="mt-1.5 w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-medium truncate ${msg.lu ? "text-gray-700" : "text-gray-900"}`}>
              {msg.sujet}
            </p>
            {ouvert ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {msg.auteurNom} · {formaterDate(msg.createdAt)}
          </p>
        </div>
      </div>
      {ouvert && (
        <div className="px-5 pb-4 pt-0">
          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.contenu}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Boîte de réception ────────────────────────────────────────────────

function TabRecus() {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery<MessageRecu[]>({
    queryKey: ["messages-recus"],
    queryFn: async () => {
      const r = await apiFetch("/api/communication/messages/recus");
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      return r.json() as Promise<MessageRecu[]>;
    },
    refetchInterval: 60_000,
  });

  const marquerLuMut = useMutation({
    mutationFn: async (id: number) => {
      await apiPut(`/api/communication/messages/${id}/lire`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages-recus"] });
      void queryClient.invalidateQueries({ queryKey: ["messages-non-lus"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const nonLus = messages.filter((m) => !m.lu).length;

  return (
    <div className="space-y-3">
      {nonLus > 0 && (
        <p className="text-xs font-medium text-green-700">
          {nonLus} message{nonLus > 1 ? "s" : ""} non lu{nonLus > 1 ? "s" : ""}
        </p>
      )}
      {messages.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">Aucun message reçu</p>
        </div>
      ) : (
        messages.map((m) => (
          <MessageCard key={m.id} msg={m} onLu={(id) => marquerLuMut.mutate(id)} />
        ))
      )}
    </div>
  );
}

// ─── Onglet Envoyés ───────────────────────────────────────────────────────────

function TabEnvoyes() {
  const { data: messages = [], isLoading } = useQuery<MessageEnvoye[]>({
    queryKey: ["messages-envoyes"],
    queryFn: async () => {
      const r = await apiFetch("/api/communication/messages/envoyes");
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      return r.json() as Promise<MessageEnvoye[]>;
    },
  });

  const destLabel = (d: string) =>
    DESTINATAIRES_OPTIONS.find((o) => o.value === d)?.label ?? d;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <div className="py-16 text-center">
          <Clock size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">Aucun message envoyé</p>
        </div>
      ) : (
        messages.map((m) => (
          <div key={m.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{m.sujet}</p>
              <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
                <Users size={10} /> {m.nbDestinataires}
              </span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{m.contenu}</p>
            <p className="text-xs text-gray-400">
              → {destLabel(m.destinataires)} · {formaterDate(m.createdAt)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = ["recus", "composer", "envoyes"] as const;
type Tab = (typeof TABS)[number];

export default function CommunicationPage() {
  const [tab, setTab] = useState<Tab>("recus");
  const queryClient = useQueryClient();
  const peutEnvoyer = usePermission("communication", "envoyer_sms");

  const { data: nonLus } = useQuery<{ count: number }>({
    queryKey: ["messages-non-lus"],
    queryFn: async () => {
      const r = await apiFetch("/api/communication/messages/non-lus");
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
    refetchInterval: 60_000,
  });

  const nbNonLus = nonLus?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communication</h1>
        <p className="text-gray-500 text-sm mt-1">Messagerie interne avec notifications push</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("recus")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "recus" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Inbox size={15} />
          Boîte de réception
          {nbNonLus > 0 && (
            <span className="ml-1 bg-green-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {nbNonLus}
            </span>
          )}
        </button>
        {peutEnvoyer && (
          <button
            onClick={() => setTab("composer")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "composer" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Send size={15} />
            Nouveau message
          </button>
        )}
        {peutEnvoyer && (
          <button
            onClick={() => setTab("envoyes")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "envoyes" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            <MessageSquare size={15} />
            Envoyés
          </button>
        )}
      </div>

      <div className="max-w-2xl">
        {tab === "recus" && <TabRecus />}
        {tab === "composer" && peutEnvoyer && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <TabComposer
              onSuccess={() => {
                void queryClient.invalidateQueries({ queryKey: ["messages-envoyes"] });
                setTab("envoyes");
              }}
            />
          </div>
        )}
        {tab === "envoyes" && peutEnvoyer && <TabEnvoyes />}
      </div>
    </div>
  );
}
