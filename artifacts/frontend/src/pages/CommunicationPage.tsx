import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, Inbox, CheckCircle, Clock, Users, MessageSquare,
  ChevronDown, ChevronUp, User, Search,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";

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
  { value: "tous",                    label: "Tous les utilisateurs" },
  { value: "direction",               label: "Direction (PCA, Directeur, Comptable)" },
  { value: "agent_terrain",           label: "Agents terrain" },
  { value: "delegue",                 label: "Délégués" },
  { value: "magasinier",              label: "Magasiniers" },
  { value: "responsable_tracabilite", label: "Responsables traçabilité" },
  { value: "auditeur",                label: "Auditeurs" },
  { value: "__specifique__",          label: "Utilisateur spécifique…" },
];

const ROLE_LABELS: Record<string, string> = {
  pca:                      "PCA",
  directeur:                "Directeur",
  comptable:                "Comptable",
  caissier:                 "Caissier",
  delegue:                  "Délégué",
  agent_terrain:            "Agent terrain",
  magasinier:               "Magasinier",
  responsable_tracabilite:  "Resp. traçabilité",
  auditeur:                 "Auditeur",
};

interface Utilisateur {
  id: number;
  nom: string;
  prenoms: string;
  role: string;
  actif: boolean;
}

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

function destLabel(d: string): string {
  if (d.startsWith("user:")) return "Message direct";
  return DESTINATAIRES_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

// ─── Picker utilisateur avec recherche ────────────────────────────────────────

function UserPicker({
  utilisateurs,
  value,
  onChange,
}: {
  utilisateurs: Utilisateur[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [recherche, setRecherche] = useState("");

  const filtres = useMemo(() => {
    const q = recherche.toLowerCase().trim();
    return utilisateurs
      .filter((u) =>
        !q ||
        u.nom.toLowerCase().includes(q) ||
        u.prenoms.toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const roleOrdre = ["pca", "directeur", "comptable", "caissier", "delegue",
          "agent_terrain", "magasinier", "responsable_tracabilite", "auditeur"];
        const ai = roleOrdre.indexOf(a.role);
        const bi = roleOrdre.indexOf(b.role);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return `${a.prenoms} ${a.nom}`.localeCompare(`${b.prenoms} ${b.nom}`, "fr");
      });
  }, [utilisateurs, recherche]);

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
      <div className="relative border-b border-gray-100">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un utilisateur…"
          className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none bg-gray-50"
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtres.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 italic">Aucun résultat</p>
        ) : (
          filtres.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onChange(String(u.id))}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                value === String(u.id) ? "bg-green-50" : ""
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                value === String(u.id)
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {u.prenoms.charAt(0)}{u.nom.charAt(0)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">
                  {u.prenoms} {u.nom}
                </span>
                <span className="block text-xs text-gray-400">
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </span>
              {value === String(u.id) && (
                <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Onglet Composer ──────────────────────────────────────────────────────────

function TabComposer({ onSuccess }: { onSuccess: () => void }) {
  const [sujet, setSujet]                       = useState("");
  const [contenu, setContenu]                   = useState("");
  const [destinataires, setDestinataires]       = useState("tous");
  const [destinataireUserId, setDestinatataireUserId] = useState<string>("");
  const [confirmation, setConfirmation]         = useState<{ nb: number; nom?: string } | null>(null);

  const modeSpecifique = destinataires === "__specifique__";

  const { data: utilisateurs = [], isLoading: loadingUsers } = useQuery<Utilisateur[]>({
    queryKey: ["users-liste"],
    queryFn: async () => {
      const r = await apiFetch("/api/users");
      if (!r.ok) return [];
      return r.json() as Promise<Utilisateur[]>;
    },
    enabled: modeSpecifique,
    staleTime: 60_000,
  });

  const utilisateursActifs = utilisateurs.filter((u) => u.actif);

  const selectedUser = useMemo(
    () => utilisateursActifs.find((u) => String(u.id) === destinataireUserId),
    [utilisateursActifs, destinataireUserId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (modeSpecifique && !destinataireUserId) {
        throw new Error("Veuillez sélectionner un destinataire");
      }

      const destPayload = modeSpecifique
        ? `user:${destinataireUserId}`
        : destinataires;

      const r = await apiPost("/api/communication/messages", {
        sujet: sujet.trim(),
        contenu: contenu.trim(),
        destinataires: destPayload,
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({ erreur: `Erreur ${r.status}` })) as { erreur: string };
        throw new Error(e.erreur);
      }
      return r.json() as Promise<{ id: number; nbDestinataires: number }>;
    },
    onSuccess: (data) => {
      setConfirmation({
        nb:  data.nbDestinataires,
        nom: selectedUser ? `${selectedUser.prenoms} ${selectedUser.nom}` : undefined,
      });
      setSujet("");
      setContenu("");
      setDestinataires("tous");
      setDestinatataireUserId("");
      onSuccess();
    },
  });

  const envoiDisabled =
    !sujet.trim() || !contenu.trim() || mutation.isPending ||
    (modeSpecifique && !destinataireUserId);

  return (
    <div className="space-y-5">

      {/* Confirmation */}
      {confirmation && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">
              {confirmation.nom
                ? `Message envoyé à ${confirmation.nom}`
                : `Message envoyé à ${confirmation.nb} utilisateur${confirmation.nb > 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Une notification push a été déclenchée pour {confirmation.nom ? "ce destinataire" : "les destinataires"} connectés.
            </p>
          </div>
          <button onClick={() => setConfirmation(null)} className="text-green-400 hover:text-green-600 text-xs">✕</button>
        </div>
      )}

      {/* Erreur */}
      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {(mutation.error as Error).message}
        </div>
      )}

      {/* Destinataires */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Destinataires</label>
        <select
          value={destinataires}
          onChange={(e) => { setDestinataires(e.target.value); setDestinatataireUserId(""); }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
        >
          {DESTINATAIRES_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Picker utilisateur spécifique */}
        {modeSpecifique && (
          loadingUsers ? (
            <p className="text-xs text-gray-400 italic mt-2">Chargement des utilisateurs…</p>
          ) : (
            <>
              <UserPicker
                utilisateurs={utilisateursActifs}
                value={destinataireUserId}
                onChange={setDestinatataireUserId}
              />
              {selectedUser && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <User size={11} />
                  Destinataire : <strong>{selectedUser.prenoms} {selectedUser.nom}</strong>
                  &nbsp;({ROLE_LABELS[selectedUser.role] ?? selectedUser.role})
                </p>
              )}
            </>
          )
        )}

        {/* Résumé cible groupe */}
        {!modeSpecifique && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Users size={11} />
            {DESTINATAIRES_OPTIONS.find((d) => d.value === destinataires)?.label ?? destinataires}
          </p>
        )}
      </div>

      {/* Sujet */}
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

      {/* Contenu */}
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

      <button
        onClick={() => mutation.mutate()}
        disabled={envoiDisabled}
        className="w-full py-3 text-white rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
        style={{ backgroundColor: VERT }}
      >
        <Send size={15} />
        {mutation.isPending ? "Envoi en cours…" : "Envoyer le message"}
      </button>
    </div>
  );
}

// ─── Carte message reçu ────────────────────────────────────────────────────────

function MessageCard({ msg, onLu }: { msg: MessageRecu; onLu: (id: number) => void }) {
  const [ouvert, setOuvert] = useState(false);

  const handleOpen = () => {
    setOuvert((v) => !v);
    if (!msg.lu) onLu(msg.id);
  };

  const estDirect = msg.destinataires.startsWith("user:");

  return (
    <div className={`border rounded-xl transition-colors cursor-pointer ${
      msg.lu ? "border-gray-100 bg-white" : "border-green-200 bg-green-50"
    }`}>
      <div className="px-4 py-3 flex items-start gap-3" onClick={handleOpen}>
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${msg.lu ? "bg-gray-200" : "bg-green-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-medium truncate ${msg.lu ? "text-gray-700" : "text-gray-900"}`}>
              {msg.sujet}
            </p>
            {ouvert
              ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" />
              : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            {estDirect && (
              <span className="inline-flex items-center gap-0.5 text-blue-500">
                <User size={9} /> Direct ·
              </span>
            )}
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
    mutationFn: async (id: number) => apiPut(`/api/communication/messages/${id}/lire`),
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

  const hasDirectMessages = messages.some((m) => m.destinataires.startsWith("user:"));

  const { data: utilisateurs = [] } = useQuery<Utilisateur[]>({
    queryKey: ["users-liste"],
    queryFn: async () => {
      const r = await apiFetch("/api/users");
      if (!r.ok) return [];
      return r.json() as Promise<Utilisateur[]>;
    },
    enabled: hasDirectMessages,
    staleTime: 60_000,
  });

  function resolveDestLabel(d: string): string {
    if (d.startsWith("user:")) {
      const uid = parseInt(d.replace("user:", ""), 10);
      const u = utilisateurs.find((u) => u.id === uid);
      return u
        ? `${u.prenoms} ${u.nom} (${ROLE_LABELS[u.role] ?? u.role})`
        : "Utilisateur direct";
    }
    return destLabel(d);
  }

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
        messages.map((m) => {
          const estDirect = m.destinataires.startsWith("user:");
          return (
            <div key={m.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{m.sujet}</p>
                <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
                  {estDirect
                    ? <User size={10} className="text-blue-400" />
                    : <Users size={10} />}
                  {estDirect ? "1" : m.nbDestinataires}
                </span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{m.contenu}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                {estDirect && <User size={9} className="text-blue-400" />}
                → {resolveDestLabel(m.destinataires)} · {formaterDate(m.createdAt)}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = ["recus", "composer", "envoyes"] as const;
type Tab = (typeof TABS)[number];

export default function CommunicationPage() {
  const [tab, setTab]     = useState<Tab>("recus");
  const queryClient       = useQueryClient();
  const peutEnvoyer       = usePermission("communication", "envoyer_sms");

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

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("recus")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "recus" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
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
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "composer" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send size={15} />
            Nouveau message
          </button>
        )}

        {peutEnvoyer && (
          <button
            onClick={() => setTab("envoyes")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "envoyes" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <MessageSquare size={15} />
            Envoyés
          </button>
        )}
      </div>

      {/* Contenu */}
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
