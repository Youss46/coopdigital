import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  HelpCircle, X, FileText, MessageCircle, List,
  ChevronRight, ChevronDown, Send, Star,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";

// Détection automatique du module depuis l'URL
function detectModule(path: string): string {
  if (path.includes("/membre"))      return "membres";
  if (path.includes("/livraison"))   return "livraisons";
  if (path.includes("/avance"))      return "avances";
  if (path.includes("/comptabilite"))return "comptabilite";
  if (path.includes("/caisse"))      return "caisse";
  if (path.includes("/emprunts"))    return "emprunts";
  if (path.includes("/stocks"))      return "stocks";
  if (path.includes("/formation"))   return "formations";
  if (path.includes("/fiscalite"))   return "fiscalite";
  if (path.includes("/reconcili"))   return "reconciliation";
  if (path.includes("/investissement")) return "investissements";
  return "general";
}

const MODULE_LABELS: Record<string, string> = {
  membres:         "Membres",
  livraisons:      "Livraisons",
  avances:         "Avances",
  comptabilite:    "Comptabilité",
  caisse:          "Caisse",
  emprunts:        "Emprunts",
  stocks:          "Stocks",
  formations:      "Formations",
  fiscalite:       "Fiscalité",
  reconciliation:  "Réconciliation",
  investissements: "Investissements",
  general:         "Général",
};

type Onglet = "accueil" | "ticket" | "faq" | "tickets";

interface FaqCategorie {
  categorie: string;
  questions: { q: string; a: string }[];
}

interface Ticket {
  id: number;
  reference: string;
  titre: string;
  statut: string;
  priorite: string;
  created_at: string;
}

const STATUT_COLORS: Record<string, string> = {
  ouvert:   "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  resolu:   "bg-green-100 text-green-700",
  ferme:    "bg-gray-100 text-gray-500",
};

// ─── Formulaire nouveau ticket ────────────────────────────────────────────────

function NouveauTicketForm({ defaultModule, onSuccess }: {
  defaultModule: string;
  onSuccess: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    titre:          "",
    description:    "",
    categorie:      "question",
    priorite:       "normale",
    moduleConcerne: defaultModule,
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/support/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erreur");
      toast({ title: `Ticket ${data.reference} créé`, description: "Notre équipe vous répond rapidement." });
      onSuccess();
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4">
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Titre *</label>
        <input
          required value={form.titre}
          onChange={(e) => set("titre", e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Résumez le problème en une phrase"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
          <select value={form.categorie} onChange={(e) => set("categorie", e.target.value)}
            className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="bug">🐛 Bug</option>
            <option value="question">❓ Question</option>
            <option value="formation">🎓 Formation</option>
            <option value="evolution">💡 Évolution</option>
            <option value="urgence">🚨 Urgence</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Priorité</label>
          <select value={form.priorite} onChange={(e) => set("priorite", e.target.value)}
            className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="basse">Basse</option>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="urgente">Urgente 🚨</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          Module — {MODULE_LABELS[form.moduleConcerne] ?? form.moduleConcerne}
        </label>
        <select value={form.moduleConcerne} onChange={(e) => set("moduleConcerne", e.target.value)}
          className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          {Object.entries(MODULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Description * <span className="font-normal">(que se passe-t-il ?)</span></label>
        <textarea
          required value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={4} placeholder="Décrivez le problème en détail. Quelle action avez-vous effectuée ? Quel est le message d'erreur ?"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
        />
      </div>
      <button
        type="submit" disabled={loading}
        className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send size={14} />
        {loading ? "Envoi…" : "Envoyer le ticket"}
      </button>
    </form>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FaqView() {
  const { token } = useAuth();
  const [faq, setFaq] = useState<FaqCategorie[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/support/faq`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setFaq)
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">Questions fréquemment posées</p>
      {faq.map((cat) => (
        <div key={cat.categorie}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat.categorie}</p>
          <div className="space-y-1">
            {cat.questions.map((q) => (
              <div key={q.q} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpen(open === q.q ? null : q.q)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-700">{q.q}</span>
                  {open === q.q ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
                </button>
                {open === q.q && (
                  <div className="px-3 pb-3 text-sm text-gray-600 bg-gray-50 border-t">{q.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mes tickets ──────────────────────────────────────────────────────────────

function MesTickets() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/support/tickets`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setTickets)
      .catch(() => null)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-center text-gray-400 py-8 text-sm">Chargement…</div>;

  return (
    <div className="p-4 space-y-2">
      {tickets.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Aucun ticket ouvert</p>
      ) : tickets.map((t) => (
        <div key={t.id} className="border rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 font-mono">{t.reference}</p>
              <p className="text-sm font-medium text-gray-800 truncate">{t.titre}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(t.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[t.statut] ?? "bg-gray-100 text-gray-600"}`}>
              {t.statut.replace("_", " ")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("accueil");
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const module = detectModule(location);

  // Fermer en cliquant à l'extérieur
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Bouton ❓ */}
      <button
        onClick={() => { setOpen((v) => !v); setOnglet("accueil"); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-green-600"
        title="Aide & Support"
        aria-label="Aide & Support"
      >
        <HelpCircle size={20} />
      </button>

      {/* Panneau latéral */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border z-50 flex flex-col max-h-[80vh] overflow-hidden">
          {/* Header panneau */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-green-50">
            <div>
              <p className="font-bold text-green-800 text-sm">Aide & Support</p>
              <p className="text-xs text-green-600">M15 Tech — CoopDigital</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          {/* Navigation onglets */}
          <div className="flex border-b">
            {([
              { id: "accueil", label: "Accueil", icon: HelpCircle },
              { id: "ticket",  label: "Signaler", icon: FileText },
              { id: "faq",     label: "FAQ", icon: List },
              { id: "tickets", label: "Mes tickets", icon: MessageCircle },
            ] as { id: Onglet; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setOnglet(id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  onglet === id
                    ? "border-green-500 text-green-700 bg-green-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Contenu scrollable */}
          <div className="overflow-y-auto flex-1">
            {onglet === "accueil" && (
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-600">Besoin d'aide ? Notre équipe M15 Tech est là pour vous.</p>

                <button
                  onClick={() => setOnglet("ticket")}
                  className="w-full flex items-center gap-3 border rounded-xl p-3 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                >
                  <span className="text-xl">📝</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Signaler un problème</p>
                    <p className="text-xs text-gray-500">Créer un ticket d'assistance</p>
                  </div>
                  <ChevronRight size={14} className="ml-auto text-gray-400" />
                </button>

                <button
                  onClick={() => setOnglet("faq")}
                  className="w-full flex items-center gap-3 border rounded-xl p-3 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                >
                  <span className="text-xl">❓</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">FAQ</p>
                    <p className="text-xs text-gray-500">Réponses aux questions courantes</p>
                  </div>
                  <ChevronRight size={14} className="ml-auto text-gray-400" />
                </button>

                <button
                  onClick={() => setOnglet("tickets")}
                  className="w-full flex items-center gap-3 border rounded-xl p-3 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                >
                  <span className="text-xl">💬</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Mes tickets</p>
                    <p className="text-xs text-gray-500">Suivre mes demandes</p>
                  </div>
                  <ChevronRight size={14} className="ml-auto text-gray-400" />
                </button>

                <div className="border rounded-xl p-3 bg-gray-50 space-y-1.5 text-sm">
                  <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide">Support M15 Tech</p>
                  <a href="https://wa.me/2250714174082" target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-green-700 hover:underline text-xs">
                    📱 WhatsApp : 07 14 17 40 82
                  </a>
                  <a href="mailto:contacteyouss@gmail.com"
                    className="flex items-center gap-2 text-blue-600 hover:underline text-xs">
                    ✉️ contacteyouss@gmail.com
                  </a>
                </div>
              </div>
            )}
            {onglet === "ticket" && (
              <NouveauTicketForm
                defaultModule={module}
                onSuccess={() => setOnglet("tickets")}
              />
            )}
            {onglet === "faq" && <FaqView />}
            {onglet === "tickets" && <MesTickets />}
          </div>
        </div>
      )}
    </div>
  );
}
