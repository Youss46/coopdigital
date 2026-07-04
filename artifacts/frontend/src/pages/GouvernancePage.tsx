import { useState, type ReactNode } from "react";
import {
  useGetAg,
  usePostAg,
  usePutAgId,
  usePutAgIdOuvrir,
  usePutAgIdCloturer,
  usePostAgIdConvoquer,
  usePostAgIdPresence,
  usePostAgIdVote,
  useGetAgId,
  getGetAgQueryKey,
  getGetAgIdQueryKey,
  type AssembleeGenerale,
  type AgListItem,
  type AgDetail,
  type PointOrdreDuJour,
  type VoteAg,
  type PresenceAvecMembre,
  type ConvocationAg,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Plus, X, CheckCircle2, Clock, AlertTriangle, Users, Send, FileText,
  ChevronDown, ChevronUp, Play, Square, Vote, Archive, Calendar, RefreshCw,
} from "lucide-react";

import { openPdfViewer } from "@/lib/pdfViewer";

const VERT = "#1a4731";
const BASE = import.meta.env.VITE_API_URL ?? "";
const getToken = () => localStorage.getItem("coop_token") ?? "";

async function downloadPvPdf(agId: number, libelle: string): Promise<void> {
  const url = `${BASE}/api/ag/${agId}/pv-pdf`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!resp.ok) throw new Error(`Erreur ${resp.status}`);
  const blob = await resp.blob();
  openPdfViewer(URL.createObjectURL(blob), `pv-ag-${libelle.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

const DATE_FR = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
};
const DATE_COURT = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

type Onglet = "ags" | "seance" | "archives";

const TYPE_LABELS: Record<string, string> = {
  ordinaire: "Ordinaire", extraordinaire: "Extraordinaire", constitutive: "Constitutive",
};
const STATUT_BADGE: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  planifiee:  { label: "Planifiée",  cls: "bg-blue-100 text-blue-700",   icon: <Clock size={12} /> },
  ouverte:    { label: "En cours",   cls: "bg-green-100 text-green-700", icon: <Play size={12} /> },
  cloturee:   { label: "Clôturée",   cls: "bg-gray-100 text-gray-600",   icon: <Square size={12} /> },
  annulee:    { label: "Annulée",    cls: "bg-red-100 text-red-700",     icon: <X size={12} /> },
};
const POINT_TYPE_LABELS: Record<string, string> = {
  information: "Info", deliberation: "Délibération", vote: "Vote", election: "Élection",
};

// ─── Modal : Planifier AG ─────────────────────────────────────────────────────
function ModalPlanifierAG({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    type: "ordinaire", libelle: "", dateAg: "", heureDebut: "", heureFin: "",
    lieu: "", quorumRequisPct: "50",
  });
  const [points, setPoints] = useState<{ intitule: string; type: string; rapporteur: string; dureeMinutes: string }[]>([
    { intitule: "Approbation du procès-verbal de la dernière AG", type: "vote",         rapporteur: "", dureeMinutes: "10" },
    { intitule: "Présentation du rapport moral du Président",     type: "information",  rapporteur: "", dureeMinutes: "15" },
    { intitule: "Présentation du rapport financier",             type: "information",  rapporteur: "", dureeMinutes: "20" },
    { intitule: "Questions diverses",                            type: "deliberation", rapporteur: "", dureeMinutes: "15" },
  ]);

  const mut = usePostAg({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgQueryKey() });
        toast({ title: "AG planifiée ✓" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const addPoint = () => setPoints((p) => [...p, { intitule: "", type: "deliberation", rapporteur: "", dureeMinutes: "" }]);
  const removePoint = (i: number) => setPoints((p) => p.filter((_, j) => j !== i));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Planifier une assemblée générale</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type d'AG</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="ordinaire">Ordinaire</option>
                <option value="extraordinaire">Extraordinaire</option>
                <option value="constitutive">Constitutive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quorum requis (%)</label>
              <input type="number" value={form.quorumRequisPct} min={1} max={100}
                onChange={(e) => setForm((f) => ({ ...f, quorumRequisPct: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
              <input value={form.libelle} onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder={`ex : AG Ordinaire ${new Date().getFullYear()}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={form.dateAg} onChange={(e) => setForm((f) => ({ ...f, dateAg: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lieu</label>
              <input value={form.lieu} onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="ex : Siège social" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Heure début</label>
              <input type="time" value={form.heureDebut} onChange={(e) => setForm((f) => ({ ...f, heureDebut: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Heure fin prévue</label>
              <input type="time" value={form.heureFin} onChange={(e) => setForm((f) => ({ ...f, heureFin: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Points ordre du jour */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Points à l'ordre du jour</h4>
              <button onClick={addPoint}
                className="text-xs px-2 py-1 text-green-700 border border-green-200 rounded-lg hover:bg-green-50">
                + Ajouter point
              </button>
            </div>
            <div className="space-y-3">
              {points.map((pt, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-5">{i + 1}.</span>
                    <input value={pt.intitule}
                      onChange={(e) => setPoints((p) => p.map((x, j) => j === i ? { ...x, intitule: e.target.value } : x))}
                      className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                      placeholder="Intitulé du point" />
                    <button onClick={() => removePoint(i)} className="text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2 ml-7">
                    <select value={pt.type}
                      onChange={(e) => setPoints((p) => p.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="information">Information</option>
                      <option value="deliberation">Délibération</option>
                      <option value="vote">Vote</option>
                      <option value="election">Élection</option>
                    </select>
                    <input value={pt.rapporteur}
                      onChange={(e) => setPoints((p) => p.map((x, j) => j === i ? { ...x, rapporteur: e.target.value } : x))}
                      className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                      placeholder="Rapporteur" />
                    <input type="number" value={pt.dureeMinutes}
                      onChange={(e) => setPoints((p) => p.map((x, j) => j === i ? { ...x, dureeMinutes: e.target.value } : x))}
                      className="w-16 border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                      placeholder="min" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
            Annuler
          </button>
          <button
            onClick={() => mut.mutate({ data: {
              type:            form.type as "ordinaire"|"extraordinaire"|"constitutive",
              libelle:         form.libelle,
              dateAg:          form.dateAg,
              heureDebut:      form.heureDebut || undefined,
              heureFin:        form.heureFin   || undefined,
              lieu:            form.lieu        || undefined,
              quorumRequisPct: parseFloat(form.quorumRequisPct) || 50,
              points: points.filter((p) => p.intitule).map((p) => ({
                intitule:     p.intitule,
                type:         p.type,
                rapporteur:   p.rapporteur || undefined,
                dureeMinutes: p.dureeMinutes ? parseInt(p.dureeMinutes) : undefined,
              })),
            }})}
            disabled={mut.isPending || !form.libelle || !form.dateAg}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}>
            {mut.isPending ? "Création…" : "Planifier l'AG"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Convocations ─────────────────────────────────────────────────────
function ModalConvoquer({ ag, onClose }: { ag: AssembleeGenerale; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [canal] = useState<"affichage">("affichage");
  const [msgPerso, setMsgPerso] = useState("");

  const mut = usePostAgIdConvoquer({
    mutation: {
      onSuccess: (data) => {
        const d = data as { envoyes?: number; echecs?: number };
        queryClient.invalidateQueries({ queryKey: getGetAgIdQueryKey(ag.id) });
        toast({ title: `Convocations envoyées : ${d?.envoyes ?? 0} succès, ${d?.echecs ?? 0} échec(s)` });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const heureStr = ag.heureDebut ? ` à ${String(ag.heureDebut).slice(0, 5)}` : "";
  const exMsg = `Cher(e) {nom}, vous êtes convoqué(e) à l'AG ${TYPE_LABELS[ag.type] ?? ag.type} le ${DATE_COURT(ag.dateAg)}${heureStr} au ${ag.lieu ?? "siège"}. Répondez OUI pour confirmer.`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Envoyer les convocations</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            Une notification push sera envoyée à tous les membres actifs connectés au portail.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message (laisser vide = automatique)</label>
            <textarea value={msgPerso} onChange={(e) => setMsgPerso(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={3}
              placeholder={exMsg} />
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            Variables disponibles : <code>{"{nom}"}</code>, <code>{"{type}"}</code>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ id: ag.id, data: { canal, messagePersonnalise: msgPerso || undefined } })}
            disabled={mut.isPending}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: VERT }}>
            <Send size={14} /> {mut.isPending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Vote ─────────────────────────────────────────────────────────────
function ModalVote({ agId, point, onClose }: { agId: number; point: PointOrdreDuJour; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ intituleResolution: point.intitule, nbPour: "", nbContre: "", nbAbstention: "" });

  const mut = usePostAgIdVote({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetAgIdQueryKey(agId) });
        const v = data as { resultat?: string; pourcentagePour?: string };
        toast({ title: `Vote enregistré — ${v.resultat === "adopte" ? "✓ Adopté" : "✗ Rejeté"} à ${Math.round(parseFloat(v.pourcentagePour ?? "0"))}%` });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const pour = parseInt(form.nbPour) || 0;
  const contre = parseInt(form.nbContre) || 0;
  const abstention = parseInt(form.nbAbstention) || 0;
  const votants = pour + contre + abstention;
  const pct = votants > 0 ? Math.round((pour / votants) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Enregistrer le vote</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Libellé de la résolution</label>
            <input value={form.intituleResolution} onChange={(e) => setForm((f) => ({ ...f, intituleResolution: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "nbPour",        label: "Pour",        cls: "text-green-700" },
              { k: "nbContre",      label: "Contre",      cls: "text-red-700"   },
              { k: "nbAbstention",  label: "Abstentions", cls: "text-gray-500"  },
            ].map(({ k, label, cls }) => (
              <div key={k}>
                <label className={`block text-xs font-bold mb-1 ${cls}`}>{label}</label>
                <input type="number" min={0} value={form[k as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center" />
              </div>
            ))}
          </div>
          {votants > 0 && (
            <div className={`rounded-lg p-3 text-center text-sm font-semibold ${pct > 50 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {pct > 50 ? "✓ ADOPTÉ" : "✗ REJETÉ"} — {pct}% pour ({votants} votants)
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ id: agId, data: {
              pointId: point.id, intituleResolution: form.intituleResolution,
              nbPour: pour, nbContre: contre, nbAbstention: abstention,
            }})}
            disabled={mut.isPending || votants === 0}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}>
            {mut.isPending ? "Enregistrement…" : "Confirmer le vote"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Barre quorum ─────────────────────────────────────────────────────────────
function QuorumBar({ ag }: { ag: AssembleeGenerale }) {
  const presents = ag.nbMembresPresents ?? 0;
  const convoques = ag.nbMembresConvoques ?? 0;
  const pct = convoques > 0 ? Math.round((presents / convoques) * 100) : 0;
  const requis = parseFloat(ag.quorumRequisPct ?? "50");

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Quorum ({requis}% requis)</span>
        <span className={`text-sm font-bold flex items-center gap-1 ${ag.quorumAtteint ? "text-green-700" : "text-orange-600"}`}>
          {ag.quorumAtteint ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {presents} / {convoques} présents — {pct}%
        </span>
      </div>
      <div className="bg-gray-100 rounded-full h-3 relative">
        <div className="h-3 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: ag.quorumAtteint ? "#16a34a" : "#f97316" }} />
        {/* Marqueur quorum requis */}
        <div className="absolute top-0 h-3 w-0.5 bg-gray-400"
          style={{ left: `${Math.min(requis, 100)}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {ag.quorumAtteint ? "✓ Quorum atteint — la séance peut délibérer valablement" : `Manque ${Math.ceil(convoques * requis / 100) - presents} présents pour atteindre le quorum`}
      </p>
    </div>
  );
}

// ─── Onglet 1 : Assemblées générales ─────────────────────────────────────────
function OngletAGs({ ags }: { ags: AgListItem[] }) {
  const peutPlanifier = usePermission("gouvernance", "planifier_ag");
  const peutConvoquer = usePermission("gouvernance", "convoquer");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [convoquerAg, setConvoquerAg] = useState<AssembleeGenerale | null>(null);

  const mutOuvrir = usePutAgIdOuvrir({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetAgQueryKey() }); toast({ title: "Séance ouverte ✓" }); },
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const prochaine = ags.find((a) => a.statut === "planifiee" && (a.dateAg ?? "") >= today);
  const passees   = ags.filter((a) => a.statut === "cloturee" || (a.dateAg ?? "") < today);
  const actives   = ags.filter((a) => a.statut === "ouverte");

  return (
    <div className="space-y-5">
      {peutPlanifier && (
        <div className="flex justify-end">
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: VERT }}>
            <Plus size={14} /> Planifier une AG
          </button>
        </div>
      )}

      {/* AG en cours */}
      {actives.map((ag) => (
        <div key={ag.id} className="bg-green-50 border-2 border-green-300 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs rounded-full font-medium">
              <Play size={11} /> SÉANCE EN COURS
            </span>
            <span className="font-bold text-gray-900">{ag.libelle}</span>
          </div>
          <QuorumBar ag={ag as AssembleeGenerale} />
        </div>
      ))}

      {/* Prochaine AG */}
      {prochaine && (
        <div className="bg-white rounded-2xl border-2 border-blue-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={16} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Prochaine AG</span>
              </div>
              <h3 className="font-bold text-gray-900 text-lg">{prochaine.libelle}</h3>
              <p className="text-sm text-gray-500">
                {TYPE_LABELS[prochaine.type]} · {DATE_FR(prochaine.dateAg)}
                {prochaine.heureDebut && ` à ${String(prochaine.heureDebut).slice(0, 5)}`}
                {prochaine.lieu && ` · ${prochaine.lieu}`}
              </p>
              <p className="text-sm text-gray-500">{prochaine.nbMembresConvoques} membres convoqués</p>
            </div>
            <div className="flex flex-col gap-2">
              {peutConvoquer && (
                <button onClick={() => setConvoquerAg(prochaine as AssembleeGenerale)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                  <Send size={13} /> Envoyer convocations
                </button>
              )}
              {peutPlanifier && (
                <button onClick={() => mutOuvrir.mutate({ id: prochaine.id })}
                  disabled={mutOuvrir.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg"
                  style={{ backgroundColor: VERT }}>
                  <Play size={13} /> Ouvrir la séance
                </button>
              )}
            </div>
          </div>
          {/* Points ordre du jour */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-700 mb-2">Ordre du jour ({(prochaine as AgListItem).nbPoints} points)</p>
            <ol className="list-decimal list-inside space-y-1">
              {(prochaine.ordreDuJour ?? []).map((item, i) => (
                <li key={i} className="text-sm text-gray-700">{item}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Timeline toutes AGs */}
      <div className="space-y-3">
        {ags.filter((a) => a.id !== prochaine?.id && !actives.find((x) => x.id === a.id)).map((ag) => {
          const badge = STATUT_BADGE[ag.statut] ?? STATUT_BADGE.planifiee;
          return (
            <div key={ag.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                    {badge.icon} {badge.label}
                  </div>
                  <span className="font-medium text-gray-900">{ag.libelle}</span>
                  <span className="text-xs text-gray-400">{TYPE_LABELS[ag.type]}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{DATE_COURT(ag.dateAg)}</span>
                  <span className="flex items-center gap-1"><Users size={12} /> {ag.nbMembresPresents}/{ag.nbMembresConvoques}</span>
                  {(ag.nbVotes ?? 0) > 0 && <span className="flex items-center gap-1"><Vote size={12} /> {ag.nbVotes} votes</span>}
                  {peutConvoquer && ag.statut === "planifiee" && (
                    <button onClick={() => setConvoquerAg(ag as AssembleeGenerale)}
                      className="px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50">
                      Convoquer
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {ags.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Aucune assemblée générale planifiée</p>
        )}
      </div>

      {showModal && <ModalPlanifierAG onClose={() => setShowModal(false)} />}
      {convoquerAg && <ModalConvoquer ag={convoquerAg} onClose={() => setConvoquerAg(null)} />}
    </div>
  );
}

// ─── Onglet 2 : Séance en direct ─────────────────────────────────────────────
function OngletSeance({ ags }: { ags: AgListItem[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutGerer  = usePermission("gouvernance", "gerer_seance");
  const peutVoter  = usePermission("gouvernance", "enregistrer_vote");
  const peutPv     = usePermission("gouvernance", "generer_pv");

  const agActive = ags.find((a) => a.statut === "ouverte") ?? ags.find((a) => a.statut === "planifiee");
  const [selectedId, setSelectedId] = useState<number | null>(agActive?.id ?? null);
  const [searchMembre, setSearchMembre] = useState("");
  const [votePoint, setVotePoint] = useState<PointOrdreDuJour | null>(null);
  const [heureFinClot, setHeureFinClot] = useState("");

  const { data: detail, refetch } = useGetAgId(selectedId ?? 0, {
    query: { queryKey: getGetAgIdQueryKey(selectedId ?? 0), enabled: !!selectedId },
  });
  const d = detail as AgDetail | undefined;

  const mutPresence = usePostAgIdPresence({
    mutation: {
      onSuccess: (data) => {
        refetch();
        const r = data as { nbMembresPresents?: number; quorumAtteint?: boolean };
        toast({ title: `Présence enregistrée · ${r.nbMembresPresents ?? 0} présents · Quorum : ${r.quorumAtteint ? "✓" : "en attente"}` });
        setSearchMembre("");
      },
    },
  });

  const mutCloturer = usePutAgIdCloturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgQueryKey() });
        refetch();
        toast({ title: "Séance clôturée ✓" });
      },
    },
  });

  const agCourante = d?.ag;
  const [pvLoading, setPvLoading] = useState(false);

  // Recherche membre dans les présences (par nom)
  const membresTrouves = (d?.presences ?? []).filter((p) =>
    `${p.membre?.prenoms ?? ""} ${p.membre?.nom ?? ""}`.toLowerCase().includes(searchMembre.toLowerCase())
  );

  const POINT_STATUT_BADGE: Record<string, { cls: string; label: string }> = {
    en_attente: { cls: "bg-gray-100 text-gray-500",   label: "En attente" },
    en_cours:   { cls: "bg-blue-100 text-blue-700",   label: "En cours"   },
    traite:     { cls: "bg-green-100 text-green-700", label: "Traité"     },
  };

  return (
    <div className="space-y-5">
      {/* Sélecteur AG */}
      <div className="flex items-center gap-3">
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-sm">
          <option value="">Sélectionner une AG…</option>
          {ags.map((a) => (
            <option key={a.id} value={a.id}>{a.libelle} ({TYPE_LABELS[a.type]})</option>
          ))}
        </select>
        {agCourante && peutGerer && agCourante.statut === "ouverte" && (
          <button onClick={() => mutCloturer.mutate({ id: agCourante.id, data: { heureFin: heureFinClot || undefined } })}
            disabled={mutCloturer.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            <Square size={13} /> Clôturer la séance
          </button>
        )}
        {agCourante && peutPv && agCourante.statut === "cloturee" && (
          <button
            onClick={() => {
              setPvLoading(true);
              downloadPvPdf(agCourante.id, agCourante.libelle).finally(() => setPvLoading(false));
            }}
            disabled={pvLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
            {pvLoading ? <RefreshCw size={13} className="animate-spin" /> : <FileText size={13} />}
            Télécharger PV
          </button>
        )}
      </div>

      {agCourante && (
        <>
          {/* Quorum */}
          <QuorumBar ag={agCourante} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Émargement */}
            {peutGerer && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users size={16} style={{ color: VERT }} /> Émargement
                </h3>
                <div className="mb-3">
                  <input value={searchMembre} onChange={(e) => setSearchMembre(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Rechercher un membre par nom…" />
                </div>
                {/* Résultats de recherche ou liste complète */}
                {searchMembre && (
                  <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    {membresTrouves.map((p) => (
                      <div key={`${p.presence?.modePresence}-${p.membre?.nom}`}
                        className="flex items-center justify-between text-sm text-gray-600 px-2 py-1 bg-gray-50 rounded">
                        <span>{p.membre?.prenoms} {p.membre?.nom}</span>
                        <CheckCircle2 size={14} className="text-green-600" />
                      </div>
                    ))}
                    {membresTrouves.length === 0 && (
                      <p className="text-xs text-gray-400 px-2">Pas de résultat dans les présences</p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="number" placeholder="ID membre" id="membre-id-input"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <button
                    onClick={() => {
                      const input = document.getElementById("membre-id-input") as HTMLInputElement;
                      const membreId = parseInt(input?.value ?? "");
                      if (!membreId || !selectedId) return;
                      mutPresence.mutate({ id: selectedId, data: { membreId, modePresence: "physique" } });
                      if (input) input.value = "";
                    }}
                    disabled={mutPresence.isPending}
                    className="px-3 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                    style={{ backgroundColor: VERT }}>
                    ✓ Marquer présent
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {(d?.presences ?? []).length} membres émargés
                </p>
              </div>
            )}

            {/* Points ordre du jour */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Ordre du jour</h3>
              <div className="space-y-2">
                {(d?.points ?? []).map((pt) => {
                  const badge = POINT_STATUT_BADGE[pt.statut] ?? POINT_STATUT_BADGE.en_attente;
                  const hasVote = (d?.votes ?? []).find((v) => v.pointId === pt.id);
                  return (
                    <div key={pt.id} className="rounded-lg border border-gray-100 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-500">{pt.numero}.</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                            <span className="text-xs text-gray-400">{POINT_TYPE_LABELS[pt.type]}</span>
                          </div>
                          <p className="text-sm text-gray-800">{pt.intitule}</p>
                          {pt.decision && (
                            <p className="text-xs text-gray-500 mt-1 italic">→ {pt.decision}</p>
                          )}
                          {hasVote && (
                            <div className={`mt-1 text-xs font-semibold ${hasVote.resultat === "adopte" ? "text-green-700" : "text-red-700"}`}>
                              {hasVote.resultat === "adopte" ? "✓ Adopté" : "✗ Rejeté"} à {Math.round(parseFloat(hasVote.pourcentagePour ?? "0"))}%
                            </div>
                          )}
                        </div>
                        {peutVoter && (pt.type === "vote" || pt.type === "election") && !hasVote && agCourante.statut === "ouverte" && (
                          <button onClick={() => setVotePoint(pt)}
                            className="shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                            <Vote size={12} /> Voter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {votePoint && selectedId && (
        <ModalVote agId={selectedId} point={votePoint} onClose={() => setVotePoint(null)} />
      )}
    </div>
  );
}

// ─── Onglet 3 : Archives & documents ─────────────────────────────────────────
function OngletArchives({ ags }: { ags: AgListItem[] }) {
  const peutPv = usePermission("gouvernance", "generer_pv");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [downloadingPvs, setDownloadingPvs] = useState<Set<number>>(new Set());

  const { data: detail } = useGetAgId(selectedId ?? 0, {
    query: { queryKey: getGetAgIdQueryKey(selectedId ?? 0), enabled: !!selectedId },
  });
  const d = detail as AgDetail | undefined;

  const clots = ags.filter((a) => a.statut === "cloturee");

  const chartData = clots.slice(0, 8).map((ag) => ({
    name: (ag.dateAg ?? "").slice(0, 7),
    "Taux présence (%)": ag.nbMembresConvoques && ag.nbMembresConvoques > 0
      ? Math.round(((ag.nbMembresPresents ?? 0) / ag.nbMembresConvoques) * 100) : 0,
  }));

  return (
    <div className="space-y-5">
      {/* Graphique participation */}
      {clots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Taux de participation par AG</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="Taux présence (%)" fill={VERT} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Liste AGs clôturées */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-3 text-left">AG</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-center">Présents</th>
              <th className="px-4 py-3 text-center">Quorum</th>
              <th className="px-4 py-3 text-center">Votes</th>
              <th className="px-4 py-3 text-center">PV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clots.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Aucune AG clôturée</td></tr>
            )}
            {clots.map((ag) => {
              const taux = ag.nbMembresConvoques && ag.nbMembresConvoques > 0
                ? Math.round(((ag.nbMembresPresents ?? 0) / ag.nbMembresConvoques) * 100) : 0;
              return (
                <tr key={ag.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(ag.id === selectedId ? null : ag.id)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{ag.libelle}</td>
                  <td className="px-4 py-3 text-gray-500">{DATE_COURT(ag.dateAg ?? null)}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{ag.nbMembresPresents ?? 0}/{ag.nbMembresConvoques} ({taux}%)</td>
                  <td className="px-4 py-3 text-center">
                    {ag.quorumAtteint
                      ? <CheckCircle2 size={16} className="text-green-600 mx-auto" />
                      : <AlertTriangle size={16} className="text-orange-500 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{ag.nbVotes}</td>
                  <td className="px-4 py-3 text-center">
                    {peutPv && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (downloadingPvs.has(ag.id)) return;
                          setDownloadingPvs((prev) => new Set(prev).add(ag.id));
                          downloadPvPdf(ag.id, ag.libelle).finally(() =>
                            setDownloadingPvs((prev) => { const s = new Set(prev); s.delete(ag.id); return s; })
                          );
                        }}
                        disabled={downloadingPvs.has(ag.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                        {downloadingPvs.has(ag.id) ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
                        PDF
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Résolutions adoptées */}
      {selectedId && d && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">
            Résolutions — {d.ag.libelle}
          </h3>
          {(d.votes ?? []).length === 0 && <p className="text-gray-400 text-sm">Aucun vote enregistré</p>}
          <div className="space-y-2">
            {(d.votes ?? []).map((v, i) => (
              <div key={v.id} className={`rounded-lg px-4 py-3 ${v.resultat === "adopte" ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold text-sm ${v.resultat === "adopte" ? "text-green-800" : "text-red-800"}`}>
                    Résolution {i + 1} — {v.resultat === "adopte" ? "✓ ADOPTÉE" : "✗ REJETÉE"}
                  </span>
                  <span className="text-xs text-gray-500">{Math.round(parseFloat(v.pourcentagePour ?? "0"))}% pour</span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{v.intituleResolution}</p>
                <p className="text-xs text-gray-400 mt-1">{v.nbPour} pour · {v.nbContre} contre · {v.nbAbstention} abstentions · {v.nbVotants} votants</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function GouvernancePage() {
  const [onglet, setOnglet] = useState<Onglet>("ags");

  const { data: ags = [] } = useGetAg({
    query: { queryKey: getGetAgQueryKey() },
  });

  const agsList = ags as AgListItem[];

  const tabs: { id: Onglet; label: string; icon: ReactNode }[] = [
    { id: "ags",      label: "Assemblées générales", icon: <Calendar size={15} /> },
    { id: "seance",   label: "Séance en direct",     icon: <Users size={15} />    },
    { id: "archives", label: "Archives & documents",  icon: <Archive size={15} /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gouvernance</h1>
        <p className="text-sm text-gray-500 mt-1">Assemblées générales, présences, votes et procès-verbaux</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setOnglet(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {onglet === "ags"      && <OngletAGs      ags={agsList} />}
      {onglet === "seance"   && <OngletSeance   ags={agsList} />}
      {onglet === "archives" && <OngletArchives ags={agsList} />}
    </div>
  );
}
