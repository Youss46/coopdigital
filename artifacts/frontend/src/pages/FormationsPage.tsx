import { useState, useCallback } from "react";
import { openPdfViewer } from "@/lib/pdfViewer";
import { MoneyInput } from "@/components/ui/money-input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Plus, Users, CheckCircle, Clock, MapPin,
  BookOpen, BarChart2, FileText, Send, Bell, Award, Search,
  ChevronDown, X, Download, CalendarDays, RefreshCw, Trash2, Banknote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";

// ─── API helpers ──────────────────────────────────────────────────────────────

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

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "PUT",
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
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(t: string | null | undefined) {
  if (!t) return "";
  return t.slice(0, 5);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: number; titre: string; thematique: string | null;
  formateur: string | null; organisme_formateur: string | null;
  lieu: string | null; date_session: string; heure_debut: string | null;
  heure_fin: string | null; duree_heures: string | null;
  nb_places: number | null; cout_fcfa: string; statut: string;
  nb_inscrits: string; nb_presents: string;
  programme_id: number | null; programme_titre: string | null;
}

interface Inscrit {
  id: number; membre_id: number; nom: string; prenoms: string | null;
  telephone: string; village: string | null; statut: string;
  sms_convocation_envoye: boolean; sms_rappel_envoye: boolean;
}

interface Attestation {
  id: number; session_id: number; membre_id: number;
  numero_attestation: string; date_emission: string; pdf_url: string | null;
  session_titre: string; session_date: string; thematique: string | null;
  membre_nom: string; membre_prenoms: string | null;
}

interface Stats {
  nbSessions: number; nbBeneficiaires: number;
  heuresDispensees: number; nbAttestations: number;
  tauxCouverture: number;
  parThematique: Array<{ thematique: string; nb: string }>;
  topMembres: Array<{ membre_nom: string; nb: string; heures: string }>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const THEMATIQUES = [
  { value: "bonnes_pratiques",  label: "Bonnes pratiques" },
  { value: "qualite_cacao",     label: "Qualité du cacao" },
  { value: "eudr",              label: "EUDR / Certification" },
  { value: "gestion_financiere",label: "Gestion financière" },
  { value: "sante_securite",    label: "Santé & sécurité" },
  { value: "agroforesterie",    label: "Agroforesterie" },
  { value: "certification",     label: "Certification" },
  { value: "numerique",         label: "Numérique" },
];

const STATUT_COLORS: Record<string, string> = {
  planifie: "bg-blue-100 text-blue-800",
  en_cours: "bg-green-100 text-green-800",
  termine:  "bg-gray-100 text-gray-700",
  annule:   "bg-red-100 text-red-700",
};

const STATUT_LABELS: Record<string, string> = {
  planifie: "Planifiée",
  en_cours: "En cours",
  termine:  "Terminée",
  annule:   "Annulée",
};

const PRESENCE_COLORS: Record<string, string> = {
  inscrit: "bg-blue-100 text-blue-700",
  present: "bg-green-100 text-green-700",
  absent:  "bg-red-100 text-red-700",
  excuse:  "bg-yellow-100 text-yellow-700",
};

// ─── Onglet Sessions ──────────────────────────────────────────────────────────

function SessionCard({ session, onSelect, onPresences, onConvoquer, onRappel, onAttestations, canPlanifier }: {
  session: Session;
  onSelect: (s: Session) => void;
  onPresences: (s: Session) => void;
  onConvoquer: (id: number) => void;
  onRappel: (id: number) => void;
  onAttestations: (id: number) => void;
  canPlanifier: boolean;
}) {
  const places = session.nb_places ?? 0;
  const inscrits = parseInt(session.nb_inscrits) || 0;
  const presents = parseInt(session.nb_presents) || 0;
  const pct = places > 0 ? Math.min(100, Math.round((inscrits / places) * 100)) : 0;
  const thLabel = THEMATIQUES.find((t) => t.value === session.thematique)?.label ?? session.thematique;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {thLabel && (
            <span className="inline-block text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full mb-1">
              {thLabel}
            </span>
          )}
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{session.titre}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUT_COLORS[session.statut] ?? "bg-gray-100 text-gray-600"}`}>
          {STATUT_LABELS[session.statut] ?? session.statut}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{fmtDate(session.date_session)}</span>
        {session.heure_debut && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(session.heure_debut)}</span>}
        {session.lieu && <span className="flex items-center gap-1 col-span-2"><MapPin className="w-3 h-3" />{session.lieu}</span>}
        {session.formateur && <span className="flex items-center gap-1 col-span-2"><Users className="w-3 h-3" />{session.formateur}</span>}
      </div>

      {places > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{inscrits} inscrits</span>
            <span>{places} places</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {session.statut === "termine" && (
        <div className="text-xs text-gray-500 flex gap-3">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{presents} présents</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button onClick={() => onSelect(session)}
          className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
          Inscrits
        </button>
        {canPlanifier && session.statut !== "annule" && session.statut !== "termine" && (
          <>
            <button onClick={() => onConvoquer(session.id)}
              className="text-xs px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 transition-colors flex items-center gap-1">
              <Send className="w-3 h-3" />Convoquer
            </button>
            <button onClick={() => onRappel(session.id)}
              className="text-xs px-2.5 py-1 bg-yellow-50 hover:bg-yellow-100 rounded-lg text-yellow-700 transition-colors flex items-center gap-1">
              <Bell className="w-3 h-3" />Rappel
            </button>
          </>
        )}
        {canPlanifier && session.statut === "en_cours" && (
          <button onClick={() => onPresences(session)}
            className="text-xs px-2.5 py-1 bg-green-50 hover:bg-green-100 rounded-lg text-green-700 transition-colors">
            Présences
          </button>
        )}
        {canPlanifier && session.statut === "termine" && (
          <button onClick={() => onAttestations(session.id)}
            className="text-xs px-2.5 py-1 bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-700 transition-colors flex items-center gap-1">
            <Award className="w-3 h-3" />Attestations
          </button>
        )}
        {canPlanifier && session.statut === "planifie" && (
          <button onClick={() => {
            apiPut(`/api/formations/sessions/${session.id}`, { statut: "en_cours" }).catch(() => {});
          }}
            className="text-xs px-2.5 py-1 bg-orange-50 hover:bg-orange-100 rounded-lg text-orange-700 transition-colors">
            Démarrer
          </button>
        )}
        {canPlanifier && session.statut === "en_cours" && (
          <button onClick={() => {
            apiPut(`/api/formations/sessions/${session.id}`, { statut: "termine" }).catch(() => {});
          }}
            className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors">
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modal Nouvelle Session ───────────────────────────────────────────────────

const INIT_FORM = {
  titre: "", thematique: "", formateur: "", organismeFormateur: "", lieu: "",
  dateSession: "", heureDebut: "", heureFin: "", dureeHeures: "",
  nbPlaces: "", coutFcfa: "", programmeId: "",
};

function ModalSession({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(INIT_FORM);
  const { toast } = useToast();

  const { data: programmes = [] } = useQuery({
    queryKey: ["formations", "programmes"],
    queryFn: () => apiFetch<Array<{ id: number; titre: string }>>("/api/formations/programmes"),
  });

  const mut = useMutation({
    mutationFn: () => apiPost("/api/formations/sessions", {
      titre: form.titre,
      thematique: form.thematique || undefined,
      formateur: form.formateur || undefined,
      organismeFormateur: form.organismeFormateur || undefined,
      lieu: form.lieu || undefined,
      dateSession: form.dateSession,
      heureDebut: form.heureDebut || undefined,
      heureFin: form.heureFin || undefined,
      dureeHeures: form.dureeHeures ? parseFloat(form.dureeHeures) : undefined,
      nbPlaces: form.nbPlaces ? parseInt(form.nbPlaces, 10) : undefined,
      coutFcfa: form.coutFcfa ? parseFloat(form.coutFcfa) : 0,
      programmeId: form.programmeId ? parseInt(form.programmeId, 10) : undefined,
    }),
    onSuccess: () => { toast({ title: "Session créée" }); onSaved(); onClose(); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Nouvelle session de formation</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Titre *</label>
            <input value={form.titre} onChange={set("titre")} placeholder="Titre de la formation"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Thématique</label>
              <select value={form.thematique} onChange={set("thematique")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Choisir —</option>
                {THEMATIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Programme <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <select value={form.programmeId} onChange={set("programmeId")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Aucun —</option>
                {programmes.map((p) => <option key={p.id} value={p.id}>{p.titre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Date *</label>
              <input type="date" value={form.dateSession} onChange={set("dateSession")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Lieu</label>
              <input value={form.lieu} onChange={set("lieu")} placeholder="Lieu"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Heure début</label>
              <input type="time" value={form.heureDebut} onChange={set("heureDebut")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Heure fin</label>
              <input type="time" value={form.heureFin} onChange={set("heureFin")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Durée (h)</label>
              <input type="number" min="0.5" step="0.5" value={form.dureeHeures} onChange={set("dureeHeures")} placeholder="4"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Formateur</label>
              <input value={form.formateur} onChange={set("formateur")} placeholder="Nom du formateur"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Organisme</label>
              <input value={form.organismeFormateur} onChange={set("organismeFormateur")} placeholder="GIZ, FIRCA…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Nb places</label>
              <input type="number" min="1" value={form.nbPlaces} onChange={set("nbPlaces")} placeholder="50"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Coût (FCFA)</label>
              <MoneyInput value={form.coutFcfa} onChange={(raw) => setForm((f) => ({ ...f, coutFcfa: raw }))} placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-xl text-sm text-gray-700">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!form.titre || !form.dateSession || mut.isPending}
            className="flex-1 py-2 bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {mut.isPending ? "Création…" : "Créer la session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Présences ──────────────────────────────────────────────────────────

function ModalPresences({ session, onClose, onSaved }: { session: Session; onClose: () => void; onSaved: () => void }) {
  const { data: inscrits = [], isLoading } = useQuery({
    queryKey: ["formations", "inscrits", session.id],
    queryFn: () => apiFetch<Inscrit[]>(`/api/formations/sessions/${session.id}/inscrits`),
  });
  const [presences, setPresences] = useState<Record<number, string>>({});
  const { toast } = useToast();
  const qc = useQueryClient();

  const statuts = ["inscrit", "present", "absent", "excuse"];

  const saveMut = useMutation({
    mutationFn: () => apiPut(`/api/formations/sessions/${session.id}/presence`, {
      presences: Object.entries(presences).map(([membreId, statut]) => ({
        membreId: parseInt(membreId, 10), statut,
      })),
    }),
    onSuccess: () => {
      toast({ title: "Présences enregistrées" });
      qc.invalidateQueries({ queryKey: ["formations", "sessions"] });
      onSaved(); onClose();
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const genMut = useMutation({
    mutationFn: () => apiPost(`/api/formations/sessions/${session.id}/attestations`, {}),
    onSuccess: (data: unknown) => {
      const d = data as { generees: number; dejaExistantes: number };
      toast({ title: `${d.generees} attestation(s) générée(s)` });
      qc.invalidateQueries({ queryKey: ["formations"] });
    },
    onError: () => toast({ title: "Erreur attestations", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">Gestion des présences</h2>
            <p className="text-xs text-gray-500">{session.titre}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {isLoading ? (
            <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
          ) : inscrits.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucun inscrit</p>
          ) : (
            inscrits.map((i) => (
              <div key={i.membre_id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{i.prenoms ? `${i.prenoms} ${i.nom}` : i.nom}</p>
                  <p className="text-xs text-gray-400">{i.village ?? ""}</p>
                </div>
                <div className="flex gap-1">
                  {statuts.map((s) => {
                    const current = presences[i.membre_id] ?? i.statut;
                    return (
                      <button key={s}
                        onClick={() => setPresences((p) => ({ ...p, [i.membre_id]: s }))}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          current === s ? PRESENCE_COLORS[s] + " border-transparent" : "border-gray-200 text-gray-400"
                        }`}>
                        {s === "inscrit" ? "—" : s === "present" ? "✓" : s === "absent" ? "✗" : "Ex"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-5 border-t flex gap-2">
          <button onClick={onClose} className="py-2 px-4 border border-gray-300 rounded-xl text-sm text-gray-700">Annuler</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="flex-1 py-2 bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button onClick={() => genMut.mutate()} disabled={genMut.isPending}
            className="py-2 px-3 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1">
            <Award className="w-4 h-4" />{genMut.isPending ? "…" : "Attestations"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet Sessions ──────────────────────────────────────────────────────────

function OngletSessions() {
  const [showModal, setShowModal] = useState(false);
  const [presencesSession, setPresencesSession] = useState<Session | null>(null);
  const [filtre, setFiltre] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const canPlanifier = usePermission("formation", "planifier");
  const canInscrire  = usePermission("formation", "inscrire");

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ["formations", "sessions"],
    queryFn: () => apiFetch<Session[]>("/api/formations/sessions"),
  });

  const convoquerMut = useMutation({
    mutationFn: (id: number) => apiPost(`/api/formations/sessions/${id}/convoquer`, {}),
    onSuccess: (d: unknown) => {
      const res = d as { envoyes: number; total: number };
      toast({ title: `Convocations envoyées à ${res.total} membre(s)` });
    },
    onError: () => toast({ title: "Erreur d'envoi", variant: "destructive" }),
  });

  const rappelMut = useMutation({
    mutationFn: (id: number) => apiPost(`/api/formations/sessions/${id}/rappel`, {}),
    onSuccess: (d: unknown) => {
      const res = d as { envoyes: number; total: number };
      toast({ title: `Rappels envoyés à ${res.total} membre(s)` });
    },
    onError: () => toast({ title: "Erreur d'envoi", variant: "destructive" }),
  });

  const attMut = useMutation({
    mutationFn: (id: number) => apiPost(`/api/formations/sessions/${id}/attestations`, {}),
    onSuccess: (d: unknown) => {
      const res = d as { generees: number };
      toast({ title: `${res.generees} attestation(s) générée(s)` });
      qc.invalidateQueries({ queryKey: ["formations"] });
    },
    onError: () => toast({ title: "Erreur attestations", variant: "destructive" }),
  });

  const filtrees = sessions.filter((s) =>
    !filtre || s.titre.toLowerCase().includes(filtre.toLowerCase()) ||
    (s.thematique ?? "").toLowerCase().includes(filtre.toLowerCase()) ||
    (s.lieu ?? "").toLowerCase().includes(filtre.toLowerCase())
  );

  const aVenir   = filtrees.filter((s) => s.statut === "planifie" || s.statut === "en_cours");
  const terminees = filtrees.filter((s) => s.statut === "termine" || s.statut === "annule");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={filtre} onChange={(e) => setFiltre(e.target.value)}
            placeholder="Rechercher une session…"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />
        </button>
        {canPlanifier && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />Planifier
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
        </div>
      ) : (
        <>
          {aVenir.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">À venir / En cours</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {aVenir.map((s) => (
                  <SessionCard key={s.id} session={s}
                    onSelect={(sess) => setPresencesSession(sess)}
                    onPresences={(sess) => setPresencesSession(sess)}
                    onConvoquer={(id) => convoquerMut.mutate(id)}
                    onRappel={(id) => rappelMut.mutate(id)}
                    onAttestations={(id) => attMut.mutate(id)}
                    canPlanifier={canPlanifier || canInscrire}
                  />
                ))}
              </div>
            </div>
          )}
          {terminees.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Passées</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {terminees.map((s) => (
                  <SessionCard key={s.id} session={s}
                    onSelect={(sess) => setPresencesSession(sess)}
                    onPresences={(sess) => setPresencesSession(sess)}
                    onConvoquer={(id) => convoquerMut.mutate(id)}
                    onRappel={(id) => rappelMut.mutate(id)}
                    onAttestations={(id) => attMut.mutate(id)}
                    canPlanifier={canPlanifier || canInscrire}
                  />
                ))}
              </div>
            </div>
          )}
          {filtrees.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune session{filtre ? " correspondante" : ""}</p>
            </div>
          )}
        </>
      )}

      {showModal && <ModalSession onClose={() => setShowModal(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["formations", "sessions"] })} />}
      {presencesSession && <ModalPresences session={presencesSession} onClose={() => setPresencesSession(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["formations", "sessions"] })} />}
    </div>
  );
}

// ─── Onglet Inscriptions ──────────────────────────────────────────────────────

type MembreMinimal = { id: number; nom: string; prenoms: string | null; code_membre: string; statut?: string };

function OngletInscriptions() {
  const [selectedSession, setSelectedSession] = useState<number | "">("");
  const [mode, setMode] = useState<"individuel" | "zone" | "tous">("individuel");
  const [section, setSection] = useState("");
  const [membreSearch, setMembreSearch] = useState("");
  const [membresSelectes, setMembresSelectes] = useState<MembreMinimal[]>([]);
  const [showMembreResults, setShowMembreResults] = useState(false);
  const [confirmNonActifs, setConfirmNonActifs] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const canInscrire = usePermission("formation", "inscrire");

  const { data: sessions = [] } = useQuery({
    queryKey: ["formations", "sessions"],
    queryFn: () => apiFetch<Session[]>("/api/formations/sessions"),
  });

  const { data: inscrits = [], isLoading: isLoadingInscrits, refetch: refetchInscrits } = useQuery({
    queryKey: ["formations", "inscrits", selectedSession],
    queryFn: () => selectedSession ? apiFetch<Inscrit[]>(`/api/formations/sessions/${selectedSession}/inscrits`) : Promise.resolve([]),
    enabled: !!selectedSession,
  });

  const { data: membreResults = [], isFetching: isFetchingMembres } = useQuery({
    queryKey: ["membres-search-formation", membreSearch],
    queryFn: () =>
      apiFetch<{ membres: MembreMinimal[] }>(`/api/membres?search=${encodeURIComponent(membreSearch)}&limit=10`)
        .then((r) => r.membres ?? []),
    enabled: membreSearch.trim().length >= 2,
  });

  const inscrireMut = useMutation({
    mutationFn: async (opts: { tous?: boolean; section?: string; membreIds?: number[] }) => {
      const r = await fetch(`${BASE}/api/formations/sessions/${selectedSession}/inscrire`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          ...(opts.tous ? { tous: true } : {}),
          ...(opts.section ? { section: opts.section } : {}),
          ...(opts.membreIds?.length ? { membreIds: opts.membreIds } : {}),
        }),
      });
      if (r.status === 422) {
        const body = await r.json() as { erreur?: string; code?: string };
        throw Object.assign(new Error(body.erreur ?? "Session complète"), { code: body.code });
      }
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<{ inscrits: number; dejaInscrits: number }>;
    },
    onSuccess: (r) => {
      toast({ title: `${r.inscrits} inscrit(s) ajouté(s)${r.dejaInscrits ? `, ${r.dejaInscrits} déjà inscrits` : ""}` });
      setMembresSelectes([]);
      setMembreSearch("");
      qc.invalidateQueries({ queryKey: ["formations", "inscrits", selectedSession] });
      qc.invalidateQueries({ queryKey: ["formations", "sessions"] });
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message?: string };
      if (e.code === "CAPACITE_DEPASSEE") {
        toast({ title: "Session complète", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Erreur inscription", variant: "destructive" });
      }
    },
  });

  const desinscrireMut = useMutation({
    mutationFn: (membreId: number) => fetch(`${BASE}/api/formations/sessions/${selectedSession}/inscrits/${membreId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    }),
    onSuccess: () => {
      toast({ title: "Membre désinscrit" });
      qc.invalidateQueries({ queryKey: ["formations", "inscrits", selectedSession] });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const convoquerMut = useMutation({
    mutationFn: () => apiPost(`/api/formations/sessions/${selectedSession}/convoquer`, {}),
    onSuccess: (d: unknown) => {
      const r = d as { envoyes: number; total: number };
      toast({ title: `Convocations envoyées à ${r.total} membre(s)` });
      refetchInscrits();
    },
    onError: () => toast({ title: "Erreur d'envoi", variant: "destructive" }),
  });

  const session = sessions.find((s) => s.id === Number(selectedSession));
  const nbConv  = inscrits.length;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Session</label>
        <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value ? Number(e.target.value) : "")}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">— Sélectionner une session —</option>
          {sessions.filter((s) => s.statut !== "annule").map((s) => (
            <option key={s.id} value={s.id}>
              {s.titre} — {fmtDate(s.date_session)} ({s.nb_inscrits} inscrits)
            </option>
          ))}
        </select>
      </div>

      {selectedSession ? (
        <>
          {/* Actions inscription */}
          {canInscrire && session && session.statut !== "termine" && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Inscrire des membres</p>
                {session.nb_places != null && (() => {
                  const deja = parseInt(session.nb_inscrits || "0");
                  const restantes = session.nb_places - deja - membresSelectes.length;
                  const couleur = restantes <= 0
                    ? "bg-red-100 text-red-700"
                    : restantes <= 5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700";
                  return (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${couleur}`}>
                      {restantes <= 0 ? "Complet" : `${restantes} place${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-2">
                {(["individuel", "zone", "tous"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      mode === m ? "bg-green-700 text-white border-transparent" : "border-gray-300 text-gray-600"
                    }`}>
                    {m === "individuel" ? "Individuel" : m === "zone" ? "Par section" : "Tous les actifs"}
                  </button>
                ))}
              </div>
              {mode === "individuel" && (
                <div className="space-y-2">
                  {/* Membres sélectionnés */}
                  {membresSelectes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {membresSelectes.map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs rounded-full px-2 py-1">
                          {m.prenoms ? `${m.prenoms} ${m.nom}` : m.nom}
                          <button type="button" onClick={() => setMembresSelectes((prev) => prev.filter((x) => x.id !== m.id))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Champ de recherche */}
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        value={membreSearch}
                        onChange={(e) => { setMembreSearch(e.target.value); setShowMembreResults(true); }}
                        onFocus={() => setShowMembreResults(true)}
                        placeholder="Rechercher un membre par nom…"
                        disabled={session.nb_places != null && (session.nb_places - parseInt(session.nb_inscrits || "0") - membresSelectes.length) <= 0}
                        className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    {showMembreResults && membreSearch.trim().length >= 2 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {isFetchingMembres ? (
                          <p className="px-3 py-3 text-sm text-gray-400 text-center">Recherche…</p>
                        ) : membreResults.filter((m) => !membresSelectes.some((s) => s.id === m.id)).length === 0 ? (
                          <p className="px-3 py-3 text-sm text-gray-400 text-center">Aucun membre trouvé pour « {membreSearch} »</p>
                        ) : (
                          membreResults
                            .filter((m) => !membresSelectes.some((s) => s.id === m.id))
                            .map((m) => {
                              const dejaInscrit = inscrits.some((i) => i.membre_id === m.id);
                              return dejaInscrit ? (
                                <div key={m.id} className="w-full px-3 py-2 text-sm flex items-center gap-2 opacity-50 cursor-not-allowed">
                                  <span className="font-medium text-gray-500">{m.prenoms ? `${m.prenoms} ${m.nom}` : m.nom}</span>
                                  <span className="text-xs text-gray-400">{m.code_membre}</span>
                                  <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Déjà inscrit</span>
                                </div>
                              ) : (
                                <button key={m.id} type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setMembresSelectes((prev) => [...prev, m]);
                                    setMembreSearch("");
                                    setShowMembreResults(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{m.prenoms ? `${m.prenoms} ${m.nom}` : m.nom}</span>
                                  <span className="text-xs text-gray-400">{m.code_membre}</span>
                                  {m.statut && m.statut !== "actif" && (
                                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                                      m.statut === "inactif"   ? "bg-gray-100 text-gray-500" :
                                      m.statut === "suspendu"  ? "bg-red-100 text-red-600"   :
                                                                  "bg-yellow-100 text-yellow-700"
                                    }`}>
                                      {m.statut}
                                    </span>
                                  )}
                                </button>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {mode === "zone" && (
                <input value={section} onChange={(e) => setSection(e.target.value)}
                  placeholder="Nom de la section / zone"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              )}
              {(() => {
                const nonActifs = mode === "individuel"
                  ? membresSelectes.filter((m) => m.statut && m.statut !== "actif")
                  : [];
                const doInscrire = () => {
                  setConfirmNonActifs(false);
                  inscrireMut.mutate(
                    mode === "tous" ? { tous: true } :
                    mode === "zone" ? { section } :
                    { membreIds: membresSelectes.map((m) => m.id) }
                  );
                };
                return (
                  <>
                    {confirmNonActifs && nonActifs.length > 0 && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                          <span>⚠️</span>
                          {nonActifs.length === 1
                            ? `${nonActifs[0].prenoms ? `${nonActifs[0].prenoms} ${nonActifs[0].nom}` : nonActifs[0].nom} est ${nonActifs[0].statut}`
                            : `${nonActifs.length} membres sélectionnés ne sont pas actifs`
                          }
                        </p>
                        <p className="text-xs text-amber-700">Voulez-vous quand même les inscrire à cette session ?</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setConfirmNonActifs(false)}
                            className="flex-1 py-1.5 border border-amber-300 rounded-lg text-xs text-amber-800 hover:bg-amber-100">
                            Annuler
                          </button>
                          <button type="button" onClick={doInscrire} disabled={inscrireMut.isPending}
                            className="flex-1 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50">
                            {inscrireMut.isPending ? "Inscription…" : "Confirmer quand même"}
                          </button>
                        </div>
                      </div>
                    )}
                    {!confirmNonActifs && (
                      <button
                        onClick={() => {
                          if (nonActifs.length > 0) { setConfirmNonActifs(true); return; }
                          doInscrire();
                        }}
                        disabled={
                          inscrireMut.isPending ||
                          (mode === "zone" && !section) ||
                          (mode === "individuel" && membresSelectes.length === 0)
                        }
                        className="w-full py-2 bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                        {inscrireMut.isPending ? "Inscription…" : (
                          mode === "individuel" && membresSelectes.length > 0
                            ? `Inscrire ${membresSelectes.length} membre${membresSelectes.length > 1 ? "s" : ""}`
                            : "Inscrire"
                        )}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Actions convocations */}
          {canInscrire && nbConv > 0 && (
            <button onClick={() => convoquerMut.mutate()} disabled={convoquerMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium border border-blue-200 disabled:opacity-50">
              <Send className="w-4 h-4" />
              {convoquerMut.isPending ? "Envoi…" : `Envoyer convocations (${nbConv} non convoqué${nbConv > 1 ? "s" : ""})`}
            </button>
          )}

          {/* Liste inscrits */}
          {isLoadingInscrits ? (
            <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {inscrits.length} inscrits
                </p>
                <button onClick={() => refetchInscrits()} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />Actualiser
                </button>
              </div>
              {inscrits.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucun inscrit</p>
              ) : (
                inscrits.map((i) => (
                  <div key={i.membre_id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-white">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {i.prenoms ? `${i.prenoms} ${i.nom}` : i.nom}
                      </p>
                      <p className="text-xs text-gray-400">{i.village ?? i.telephone}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLORS[i.statut] ?? "bg-gray-100 text-gray-600"}`}>
                      {i.statut}
                    </span>
                    {canInscrire && session?.statut !== "termine" && (
                      <button onClick={() => desinscrireMut.mutate(i.membre_id)}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sélectionner une session pour gérer les inscriptions</p>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Attestations ──────────────────────────────────────────────────────

function OngletAttestations() {
  const [search, setSearch] = useState("");
  const [sessionFiltre, setSessionFiltre] = useState<number | "">("");
  const { toast } = useToast();

  const { data: sessions = [] } = useQuery({
    queryKey: ["formations", "sessions"],
    queryFn: () => apiFetch<Session[]>("/api/formations/sessions"),
  });

  const { data: attestations = [], isLoading, refetch } = useQuery({
    queryKey: ["formations", "attestations", sessionFiltre, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sessionFiltre) params.set("session_id", String(sessionFiltre));
      if (search) params.set("q", search);
      return apiFetch<Attestation[]>(`/api/formations/attestations?${params}`);
    },
  });

  const canGenerer = usePermission("formation", "generer_attestation");
  const [downloading, setDownloading] = useState<Set<number>>(new Set());

  async function downloadAttestation(sessionId: number, membreId: number, numero: string, attestationId: number) {
    if (downloading.has(attestationId)) return;
    setDownloading((prev) => new Set(prev).add(attestationId));
    const url = `${BASE}/api/formations/sessions/${sessionId}/attestation/${membreId}`;
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) throw new Error(`Erreur ${resp.status}`);
      const blob = await resp.blob();
      openPdfViewer(URL.createObjectURL(blob), `attestation-${numero}.pdf`);
    } catch {
      toast({ title: "Erreur lors du téléchargement de l'attestation", variant: "destructive" });
    } finally {
      setDownloading((prev) => { const s = new Set(prev); s.delete(attestationId); return s; });
    }
  }

  const genAllMut = useMutation({
    mutationFn: () => apiPost(`/api/formations/sessions/${sessionFiltre}/attestations`, {}),
    onSuccess: (d: unknown) => {
      const r = d as { generees: number; dejaExistantes: number };
      toast({ title: `${r.generees} attestation(s) générée(s)${r.dejaExistantes ? `, ${r.dejaExistantes} existantes` : ""}` });
      refetch();
    },
    onError: () => toast({ title: "Erreur génération", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un membre ou N° attestation…"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <select value={sessionFiltre} onChange={(e) => setSessionFiltre(e.target.value ? Number(e.target.value) : "")}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Toutes les sessions</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.titre} — {fmtDate(s.date_session)}</option>)}
        </select>
        {canGenerer && sessionFiltre && (
          <button onClick={() => genAllMut.mutate()} disabled={genAllMut.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            <Award className="w-4 h-4" />{genAllMut.isPending ? "…" : "Générer toutes"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
        </div>
      ) : attestations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune attestation</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attestations.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
              <Award className="w-5 h-5 text-purple-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {a.membre_prenoms ? `${a.membre_prenoms} ${a.membre_nom}` : a.membre_nom}
                </p>
                <p className="text-xs text-gray-400 truncate">{a.session_titre} · {fmtDate(a.session_date)}</p>
                <p className="text-xs text-purple-600 font-mono">{a.numero_attestation}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">{fmtDate(a.date_emission)}</p>
                {a.thematique && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {THEMATIQUES.find((t) => t.value === a.thematique)?.label ?? a.thematique}
                  </span>
                )}
              </div>
              <button
                onClick={() => downloadAttestation(a.session_id, a.membre_id, a.numero_attestation, a.id)}
                disabled={downloading.has(a.id)}
                title="Télécharger l'attestation PDF"
                className="p-2 text-gray-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {downloading.has(a.id)
                  ? <RefreshCw className="w-4 h-4 animate-spin text-green-600" />
                  : <Download className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Onglet Statistiques ──────────────────────────────────────────────────────

function OngletStatistiques() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["formations", "stats"],
    queryFn: () => apiFetch<Stats>("/api/formations/stats"),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
    </div>
  );

  if (!stats) return null;

  const maxTh = Math.max(...stats.parThematique.map((t) => parseInt(t.nb)), 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Sessions", value: stats.nbSessions, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Bénéficiaires", value: stats.nbBeneficiaires, icon: Users, color: "text-green-600", bg: "bg-green-50" },
          { label: "Heures dispensées", value: `${stats.heuresDispensees}h`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Attestations", value: stats.nbAttestations, icon: Award, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Taux de couverture */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Taux de couverture des membres</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="w-full bg-gray-100 rounded-full h-4">
              <div
                className="h-4 rounded-full bg-green-500 transition-all"
                style={{ width: `${stats.tauxCouverture}%` }}
              />
            </div>
          </div>
          <span className="text-lg font-bold text-green-700 w-12 text-right">{stats.tauxCouverture}%</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{stats.nbBeneficiaires} membres formés</p>
      </div>

      {/* Par thématique */}
      {stats.parThematique.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sessions par thématique</h3>
          <div className="space-y-2.5">
            {stats.parThematique.map((t) => {
              const label = THEMATIQUES.find((th) => th.value === t.thematique)?.label ?? t.thematique;
              const pct = Math.round((parseInt(t.nb) / maxTh) * 100);
              return (
                <div key={t.thematique}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{label}</span>
                    <span className="font-semibold">{t.nb} session(s)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top membres */}
      {stats.topMembres.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Membres les plus formés</h3>
          <div className="space-y-2">
            {stats.topMembres.map((m, i) => (
              <div key={m.membre_nom} className="flex items-center gap-3 py-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? "bg-yellow-100 text-yellow-700" :
                  i === 1 ? "bg-gray-100 text-gray-600" :
                  i === 2 ? "bg-orange-100 text-orange-700" : "text-gray-400"
                }`}>{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800">{m.membre_nom}</span>
                <span className="text-xs text-gray-500">{m.nb} formation(s)</span>
                <span className="text-xs font-medium text-green-700">{parseFloat(m.heures)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Programmes ────────────────────────────────────────────────────────

type Programme = {
  id: number; titre: string; description: string | null;
  thematiques: string[]; financeur: string | null;
  budgetFcfa: string | null; dateDebut: string | null; dateFin: string | null;
  statut: string;
};

const INIT_PROG = { titre: "", description: "", financeur: "", budgetFcfa: "", dateDebut: "", dateFin: "" };

function OngletProgrammes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canPlanifier = usePermission("formation", "planifier");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(INIT_PROG);
  const [delId, setDelId]       = useState<number | null>(null);

  const { data: programmes = [], isLoading } = useQuery<Programme[]>({
    queryKey: ["formations", "programmes"],
    queryFn: () => apiFetch("/api/formations/programmes"),
  });

  const createMut = useMutation({
    mutationFn: () => apiPost("/api/formations/programmes", {
      titre:       form.titre,
      description: form.description || undefined,
      financeur:   form.financeur   || undefined,
      budgetFcfa:  form.budgetFcfa  ? parseFloat(form.budgetFcfa) : undefined,
      dateDebut:   form.dateDebut   || undefined,
      dateFin:     form.dateFin     || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formations", "programmes"] });
      setShowForm(false); setForm(INIT_PROG);
      toast({ title: "Programme créé" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/formations/programmes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formations", "programmes"] });
      setDelId(null);
      toast({ title: "Programme supprimé" });
    },
    onError: () => toast({ title: "Erreur suppression", variant: "destructive" }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Les programmes regroupent plusieurs sessions de formation.</p>
        {canPlanifier && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />Nouveau programme
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin" /></div>
      ) : programmes.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Aucun programme créé</p>
          {canPlanifier && (
            <button onClick={() => setShowForm(true)} className="mt-3 text-green-700 text-sm font-medium hover:underline">
              Créer le premier programme
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {programmes.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{p.titre}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUT_COLORS[p.statut] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUT_LABELS[p.statut] ?? p.statut}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                    {p.financeur   && <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />{p.financeur}</span>}
                    {p.budgetFcfa  && parseFloat(p.budgetFcfa) > 0 && (
                      <span>{Number(p.budgetFcfa).toLocaleString("fr-FR")} FCFA</span>
                    )}
                    {p.dateDebut   && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{fmtDate(p.dateDebut)}{p.dateFin ? ` → ${fmtDate(p.dateFin)}` : ""}</span>}
                    {p.thematiques?.length > 0 && (
                      <span>{p.thematiques.length} thématique{p.thematiques.length > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                {canPlanifier && (
                  <button onClick={() => setDelId(p.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création programme */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-900">Nouveau programme</h2>
              <button onClick={() => { setShowForm(false); setForm(INIT_PROG); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Titre *</label>
                <input value={form.titre} onChange={set("titre")} placeholder="Ex : Programme BPA 2025"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={set("description")} rows={2} placeholder="Objectifs du programme…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Financeur</label>
                  <input value={form.financeur} onChange={set("financeur")} placeholder="GIZ, FIRCA…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Budget (FCFA)</label>
                  <MoneyInput value={form.budgetFcfa} onChange={(raw) => setForm((f) => ({ ...f, budgetFcfa: raw }))} placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Date début</label>
                  <input type="date" value={form.dateDebut} onChange={set("dateDebut")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Date fin</label>
                  <input type="date" value={form.dateFin} onChange={set("dateFin")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => { setShowForm(false); setForm(INIT_PROG); }}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-sm text-gray-700">Annuler</button>
              <button onClick={() => createMut.mutate()} disabled={!form.titre || createMut.isPending}
                className="flex-1 py-2 bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {createMut.isPending ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {delId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Supprimer ce programme ?</h3>
            <p className="text-sm text-gray-500 mb-5">Les sessions associées ne seront pas supprimées.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Annuler</button>
              <button onClick={() => deleteMut.mutate(delId)} disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">
                {deleteMut.isPending ? "…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { key: "programmes",     label: "Programmes",     icon: FileText },
  { key: "sessions",       label: "Sessions",       icon: BookOpen },
  { key: "inscriptions",   label: "Inscriptions",   icon: Users },
  { key: "attestations",   label: "Attestations",   icon: Award },
  { key: "statistiques",   label: "Statistiques",   icon: BarChart2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function FormationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("sessions");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-xl">
            <GraduationCap className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Formations</h1>
            <p className="text-xs text-gray-500">Renforcement de capacités des producteurs</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === key
                  ? "border-green-700 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-3xl mx-auto">
        {activeTab === "programmes"   && <OngletProgrammes />}
        {activeTab === "sessions"     && <OngletSessions />}
        {activeTab === "inscriptions" && <OngletInscriptions />}
        {activeTab === "attestations" && <OngletAttestations />}
        {activeTab === "statistiques" && <OngletStatistiques />}
      </div>
    </div>
  );
}
