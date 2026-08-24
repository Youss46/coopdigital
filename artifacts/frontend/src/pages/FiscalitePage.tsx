import { useState, useCallback, useEffect } from "react";
import { openPdfViewer } from "@/lib/pdfViewer";
import { Calculator, AlertTriangle, CheckCircle2, Clock, Download, Plus, RefreshCw, X, Calendar, Trash2, RotateCcw, Pencil, ToggleLeft, ToggleRight, Settings } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";
const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

const MOIS_NOMS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
                   "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

interface Obligation {
  id: number;
  cooperative_id: number;
  type_taxe: string;
  libelle: string;
  base_calcul: string | null;
  taux_pct: string | null;
  periodicite: string;
  jour_echeance: number | null;
  actif: boolean;
  created_at: string;
}
interface Declaration {
  id: number; periode: string; base_imposable_fcfa: string | null;
  montant_calcule_fcfa: string; montant_paye_fcfa: string;
  date_echeance: string | null; date_paiement: string | null;
  reference_paiement: string | null; statut: string;
  penalite_retard_fcfa: string; document_url: string | null;
  type_taxe: string; libelle: string; periodicite: string;
  jours_retard: number | null;
}
interface TresorerieOption {
  id: number;
  nom: string;
  operateur?: string;
  solde_actuel_fcfa: string | number;
  session_ouverte?: boolean;
}

interface CalendrierItem {
  id: number; periode: string; montant_calcule_fcfa: string;
  date_echeance: string; statut: string; penalite_retard_fcfa: string;
  type_taxe: string; libelle: string; jours_restants: number | null;
}

interface RapportAnnuel {
  annee: number; totalCalcule: number; totalPaye: number; totalPenalite: number;
  lignes: Array<{
    type_taxe: string; libelle: string; periodicite: string;
    nb_declarations: string; montant_calcule_total: string;
    montant_paye_total: string; penalite_total: string; nb_retard: string;
  }>;
}

// ─── Statut badge ─────────────────────────────────────────────────────────────

function StatutBadge({ statut, joursRetard }: { statut: string; joursRetard?: number | null }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    a_payer:   { cls: "bg-amber-100 text-amber-700",  label: "À payer" },
    paye:      { cls: "bg-green-100 text-green-700",  label: "Payé" },
    en_retard: { cls: "bg-red-100 text-red-700",      label: joursRetard ? `En retard (${joursRetard}j)` : "En retard" },
    exonere:   { cls: "bg-gray-100 text-gray-500",    label: "Exonéré" },
    conteste:  { cls: "bg-purple-100 text-purple-700", label: "Contesté" },
  };
  const { cls, label } = cfg[statut] ?? { cls: "bg-gray-100 text-gray-500", label: statut };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ─── Modal Paiement ───────────────────────────────────────────────────────────

function ModalPaiement({ decl, onClose, onDone }: { decl: Declaration; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [montant, setMontant] = useState(String(Math.round(parseFloat(decl.montant_calcule_fcfa) + parseFloat(decl.penalite_retard_fcfa || "0"))));
  const [reference, setReference] = useState("");
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [modePaiement, setModePaiement] = useState<"especes" | "mobile_marchand" | "virement" | "cheque">("especes");
  const [caisseId, setCaisseId] = useState("");
  const [mobileCompteId, setMobileCompteId] = useState("");
  const [banqueId, setBanqueId] = useState("");
  const [caisses, setCaisses] = useState<TresorerieOption[]>([]);
  const [mobiles, setMobiles] = useState<TresorerieOption[]>([]);
  const [banques, setBanques] = useState<TresorerieOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch(`${BASE}/api/mobile-marchand/caisses`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/mobile-marchand`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/mobile-marchand/comptes-bancaires`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.ok ? r.json() : []),
    ]).then(([caissesData, mobilesData, banquesData]) => {
      const nextCaisses = caissesData as TresorerieOption[];
      const nextMobiles = mobilesData as TresorerieOption[];
      const nextBanques = banquesData as TresorerieOption[];
      setCaisses(nextCaisses);
      setMobiles(nextMobiles);
      setBanques(nextBanques);
      if (nextCaisses[0]) setCaisseId(String(nextCaisses[0].id));
      if (nextMobiles[0]) setMobileCompteId(String(nextMobiles[0].id));
      if (nextBanques[0]) setBanqueId(String(nextBanques[0].id));
    }).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!montant || parseInt(montant) <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    if (modePaiement === "especes" && !caisseId) { toast({ title: "Caisse requise", description: "Sélectionnez la caisse qui règle la TSE.", variant: "destructive" }); return; }
    if (modePaiement === "mobile_marchand" && !mobileCompteId) { toast({ title: "Compte requis", description: "Sélectionnez le compte Mobile Marchand.", variant: "destructive" }); return; }
    if ((modePaiement === "virement" || modePaiement === "cheque") && !banqueId) { toast({ title: "Compte bancaire requis", description: "Sélectionnez le compte bancaire.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/declarations/${decl.id}/payer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          montantPaye: parseInt(montant), reference, datePaiement, modePaiement,
          caisseId: modePaiement === "especes" ? Number(caisseId) : undefined,
          mobileCompteId: modePaiement === "mobile_marchand" ? Number(mobileCompteId) : (modePaiement === "virement" || modePaiement === "cheque" ? Number(banqueId) : undefined),
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Paiement enregistré", description: `${decl.libelle} — ${decl.periode}` });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const total = parseFloat(decl.montant_calcule_fcfa) + parseFloat(decl.penalite_retard_fcfa || "0");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Enregistrer le paiement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-800">{decl.libelle} — {decl.periode}</p>
            <p className="text-gray-500 mt-1">Montant dû : {FCFA(decl.montant_calcule_fcfa)}</p>
            {parseFloat(decl.penalite_retard_fcfa) > 0 && (
              <p className="text-red-600 mt-0.5">Pénalité : {FCFA(decl.penalite_retard_fcfa)}</p>
            )}
            <p className="font-semibold text-gray-800 mt-1 border-t pt-1">Total : {FCFA(total)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement *</label>
            <select value={modePaiement} onChange={e => setModePaiement(e.target.value as "especes" | "mobile_marchand" | "virement" | "cheque")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="especes">Espèces</option>
              <option value="mobile_marchand">Mobile Marchand</option>
              <option value="virement">Virement bancaire</option>
              <option value="cheque">Chèque</option>
            </select>
          </div>
          {modePaiement === "especes" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caisse *</label>
              <select value={caisseId} onChange={e => setCaisseId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Sélectionner une caisse</option>
                {caisses.map(c => <option key={c.id} value={c.id}>{c.nom} — {FCFA(c.solde_actuel_fcfa)}</option>)}
              </select>
            </div>
          ) : modePaiement === "mobile_marchand" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compte Mobile Marchand *</label>
              <select value={mobileCompteId} onChange={e => setMobileCompteId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Sélectionner un compte</option>
                {mobiles.map(m => <option key={m.id} value={m.id}>{m.nom}{m.operateur ? ` (${m.operateur})` : ""} — {FCFA(m.solde_actuel_fcfa)}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compte bancaire *</label>
              <select value={banqueId} onChange={e => setBanqueId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Sélectionner un compte</option>
                {banques.map(b => <option key={b.id} value={b.id}>{b.nom} — {FCFA(b.solde_actuel_fcfa)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant payé (FCFA) *</label>
            <MoneyInput value={montant} onChange={(raw) => setMontant(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement *</label>
            <input type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Référence quittance</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: QUI-2026-06-1234" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700">
            {loading ? "Enregistrement…" : "Confirmer le paiement"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Génération ─────────────────────────────────────────────────────────

function ModalGenerer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const now  = new Date();
  const [mois, setMois]   = useState(String(now.getMonth() + 1));
  const [annee, setAnnee] = useState(String(now.getFullYear()));
  const [type, setType]   = useState<"mensuel" | "annuel">("mensuel");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const url = type === "mensuel"
        ? `${BASE}/api/fiscalite/generer/${mois}/${annee}`
        : `${BASE}/api/fiscalite/generer-annuel/${annee}`;
      const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tok()}` } });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      if (json.aucuneObligation) {
        toast({ title: "Aucune obligation configurée", description: "Configurez d'abord vos obligations fiscales dans l'onglet Tableau de bord.", variant: "destructive" });
      } else {
        const { creees = 0, misesAJour = 0, ignorees = 0 } = json as { creees: number; misesAJour: number; ignorees: number };
        const parts: string[] = [];
        if (creees > 0)     parts.push(`${creees} créée(s)`);
        if (misesAJour > 0) parts.push(`${misesAJour} mise(s) à jour`);
        if (ignorees > 0)   parts.push(`${ignorees} déjà à jour`);
        toast({ title: "Déclarations générées", description: parts.length ? parts.join(", ") + "." : "Aucune modification." });
      }
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Générer les déclarations</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["mensuel", "annuel"] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-3 rounded-lg text-sm font-medium transition-all ${type === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "mensuel" ? "📅 Mensuel (CNPS, ITS)" : "📆 Annuel (TA, FPC, IS)"}
              </button>
            ))}
          </div>
          {type === "mensuel" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mois *</label>
              <select value={mois} onChange={e => setMois(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {MOIS_NOMS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Année *</label>
            <input type="number" value={annee} onChange={e => setAnnee(e.target.value)} min="2020" max="2030"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
            {type === "mensuel"
              ? "Les bases CNPS et ITS sont calculées depuis les bulletins de paie payés de la période."
              : "Les bases TA et FPC sont calculées depuis les charges patronales cumulées sur l'année."}
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700">
            {loading ? "Génération…" : "Générer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bouton d'initialisation des obligations CI ───────────────────────────────

function InitObligationsButton({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const init = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/obligations/init-ci`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      const { creees, dejaPresentes } = json as { creees: number; dejaPresentes: number };
      if (creees > 0) {
        toast({ title: "Obligations initialisées", description: `${creees} obligation(s) ivoirienne(s) créée(s) — CNPS, ITS, TA, FPC, IS.` });
        onDone();
      } else {
        toast({ title: "Déjà configurées", description: `${dejaPresentes} obligation(s) déjà présentes.` });
      }
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <button
      onClick={init}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50"
    >
      <Calculator size={14} />
      {loading ? "Initialisation…" : "Initialiser les obligations standard (Côte d'Ivoire)"}
    </button>
  );
}

const TYPE_TAXE_OPTIONS = [
  { value: "cnps",               label: "CNPS" },
  { value: "its",                label: "ITS" },
  { value: "tva",                label: "TVA" },
  { value: "impot_societes",     label: "Impôt sur les sociétés (IS)" },
  { value: "taxe_apprentissage", label: "Taxe d'apprentissage (TA)" },
  { value: "fpc",                label: "FPC" },
  { value: "tse",                label: "TSE — Taxe Spéciale d'Équipement" },
  { value: "ppsi",               label: "PPSI — Retenue secteur informel" },
  { value: "autre",              label: "Autre" },
];
function TableauBordFiscal() {
  const [calendrier, setCalendrier] = useState<CalendrierItem[] | null>(null);
  const [alertes, setAlertes]       = useState<CalendrierItem[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const { toast } = useToast();

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [rCal, rAl] = await Promise.all([
        fetch(`${BASE}/api/fiscalite/calendrier`, { headers: { Authorization: `Bearer ${tok()}` } }),
        fetch(`${BASE}/api/fiscalite/alertes`,    { headers: { Authorization: `Bearer ${tok()}` } }),
      ]);
      if (!rCal.ok) throw new Error((await rCal.json().catch(() => ({}))).error ?? `Erreur ${rCal.status}`);
      if (!rAl.ok)  throw new Error((await rAl.json().catch(() => ({}))).error  ?? `Erreur ${rAl.status}`);
      setCalendrier(await rCal.json());
      setAlertes(await rAl.json());
    } catch (e) {
      if (!navigator.onLine) return;
      toast({ title: "Erreur chargement", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);

  const urgenceIcon = (jours: number | null) => {
    if (jours === null) return "🔵";
    if (jours < 0)  return "🔴";
    if (jours <= 7) return "🔴";
    if (jours <= 15) return "🟡";
    return "🔵";
  };

  // Grouper par mois
  const parMois = calendrier?.reduce((acc, item) => {
    if (!item.date_echeance) return acc;
    const d = new Date(item.date_echeance + "T00:00:00");
    const key = `${MOIS_NOMS[d.getMonth() + 1]} ${d.getFullYear()}`;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(item);
    return acc;
  }, {} as Record<string, CalendrierItem[]>) ?? {};

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Alertes urgentes */}
      {alertes && alertes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600" />
            <h3 className="font-semibold text-red-800">{alertes.length} déclaration(s) urgente(s) ou en retard</h3>
          </div>
          <div className="space-y-2">
            {alertes.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">{a.libelle} — {a.periode}</p>
                  <p className="text-xs text-gray-500">
                    Échéance : {a.date_echeance ? new Date(a.date_echeance + "T00:00:00").toLocaleDateString("fr-FR") : "—"}
                    {(a.jours_restants ?? 0) < 0 ? ` (${Math.abs(a.jours_restants!)} j de retard)` : a.jours_restants === 0 ? " (aujourd'hui !)" : ` (J-${a.jours_restants})`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">{FCFA(a.montant_calcule_fcfa)}</p>
                  <StatutBadge statut={a.statut} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendrier */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Calendar size={16} className="text-green-600" /> Calendrier des échéances (3 prochains mois)
          </h3>
          <button onClick={charger} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>

        {Object.keys(parMois).length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-gray-400">Aucune déclaration à venir. Générez les déclarations du mois.</p>
            <InitObligationsButton onDone={charger} />
          </div>
        ) : (
          Object.entries(parMois).map(([moisLabel, items]) => (
            <div key={moisLabel} className="mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{moisLabel}</p>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{urgenceIcon(item.jours_restants)}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.libelle}</p>
                        <p className="text-xs text-gray-400">
                          {item.date_echeance ? new Date(item.date_echeance + "T00:00:00").toLocaleDateString("fr-FR") : "—"}
                          {item.jours_restants !== null && (
                            <span className={`ml-2 ${item.jours_restants < 0 ? "text-red-600 font-medium" : item.jours_restants <= 7 ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                              {item.jours_restants < 0 ? `${Math.abs(item.jours_restants)} j de retard` : item.jours_restants === 0 ? "AUJOURD'HUI" : `J-${item.jours_restants}`}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">
                        {parseFloat(item.montant_calcule_fcfa) > 0 ? FCFA(item.montant_calcule_fcfa) : "À calculer"}
                      </p>
                      <StatutBadge statut={item.statut} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Gestion des obligations */}
      <SectionObligations onObligationsChange={charger} />
    </div>
  );
}

// ─── Modal bordereau CNPS ─────────────────────────────────────────────────────

function ModalBordereauCnps({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const now = new Date();
  const [mois,  setMois]  = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);

  const telecharger = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `${BASE}/api/fiscalite/bordereau-cnps-pdf/${mois}/${annee}`,
        { headers: { Authorization: `Bearer ${tok()}` } },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Erreur serveur");
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      openPdfViewer(url, `bordereau-cnps-${annee}-${String(mois).padStart(2, "0")}.pdf`);
      onClose();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Bordereau CNPS</h3>
            <p className="text-sm text-gray-500 mt-1">
              Générez le bordereau de cotisations CNPS pour la période sélectionnée.
              Seuls les bulletins validés ou payés sont inclus.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mois</label>
            <select value={mois} onChange={e => setMois(+e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              {MOIS_NOMS.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Année</label>
            <select value={annee} onChange={e => setAnnee(+e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={telecharger} disabled={loading}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading
              ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              : <Download size={14} />}
            Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 2 — Déclarations ──────────────────────────────────────────────────

function Declarations() {
  const { toast } = useToast();
  const [declarations, setDeclarations] = useState<Declaration[] | null>(null);
  const [loading, setLoading]           = useState(false);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreType, setFiltreType]     = useState("");
  const [modalPayer, setModalPayer]     = useState<Declaration | null>(null);
  const [modalGenerer, setModalGenerer] = useState(false);
  const [modalBordereau, setModalBordereau] = useState(false);
  const [actionLoading, setActionLoading]   = useState<number | null>(null); // id de la ligne en cours

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${BASE}/api/fiscalite/declarations?`;
      if (filtreStatut) url += `statut=${filtreStatut}&`;
      if (filtreType)   url += `type_taxe=${filtreType}&`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      setDeclarations(await r.json());
    } catch (e) {
      if (!navigator.onLine) return;
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [filtreStatut, filtreType, toast]);

  useEffect(() => { charger(); }, [charger]);

  const handleSupprimer = async (d: Declaration) => {
    if (!window.confirm(`Supprimer la déclaration "${d.libelle} — ${d.periode}" ?`)) return;
    setActionLoading(d.id);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/declarations/${d.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      toast({ title: "Déclaration supprimée" });
      charger();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const handleRecalculer = async (d: Declaration) => {
    setActionLoading(d.id);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/declarations/${d.id}/recalculer`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Déclaration recalculée", description: "Les bases ont été mises à jour depuis les bulletins payés." });
      charger();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const handleExportPpsi = async (d: Declaration) => {
    const [moisNom, anneeStr] = d.periode.trim().split(/\s+/);
    const mois = MOIS_EXPORT[(moisNom ?? "").toLowerCase()];
    const annee = Number(anneeStr);
    if (!mois || !annee) {
      toast({ title: "Période invalide", description: "Impossible de préparer l'export PPSSI.", variant: "destructive" });
      return;
    }
    try {
      const r = await fetch(`${BASE}/api/fiscalite/ppsi/export/${mois}/${annee}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erreur lors de l'export");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ppsi-${annee}-${String(mois).padStart(2, "0")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export impossible", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const getPpsiPeriod = (d: Declaration) => {
    const [moisNom, anneeStr] = d.periode.trim().split(/\s+/);
    return { mois: MOIS_EXPORT[(moisNom ?? "").toLowerCase()], annee: Number(anneeStr) };
  };

  const handleExportPpsiPdf = async (d: Declaration) => {
    const { mois, annee } = getPpsiPeriod(d);
    if (!mois || !annee) return;
    try {
      const r = await fetch(`${BASE}/api/fiscalite/ppsi/export-pdf/${mois}/${annee}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error("Erreur lors de la génération du PDF");
      const url = URL.createObjectURL(await r.blob());
      openPdfViewer(url, `ppsi-${annee}-${String(mois).padStart(2, "0")}.pdf`);
    } catch (e) {
      toast({ title: "Export PDF impossible", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const handleExportPpsiExcel = async (d: Declaration) => {
    const { mois, annee } = getPpsiPeriod(d);
    if (!mois || !annee) return;
    try {
      const r = await fetch(`${BASE}/api/fiscalite/ppsi/export/${mois}/${annee}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error("Erreur lors de la récupération des données");
      const csv = await r.text();
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("PPSSI");
      csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).forEach(line => {
        const cells: string[] = [];
        line.replace(/"((?:""|[^"])*)"(?:;|$)/g, (_match, value: string) => { cells.push(value.replaceAll('""', '"')); return ""; });
        ws.addRow(cells);
      });
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
      ws.columns.forEach(col => { col.width = Math.min(Math.max((col.header?.toString().length ?? 12) + 4, 14), 35); });
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `ppsi-${annee}-${String(mois).padStart(2, "0")}.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export Excel impossible", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  return (
    <div>
      {/* Barre actions */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Tous les statuts</option>
          <option value="a_payer">À payer</option>
          <option value="en_retard">En retard</option>
          <option value="paye">Payé</option>
          <option value="exonere">Exonéré</option>
        </select>
        <select value={filtreType} onChange={e => setFiltreType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Tous les types</option>
          <option value="cnps">CNPS</option>
          <option value="its">ITS</option>
          <option value="taxe_apprentissage">Taxe apprentissage</option>
          <option value="fpc">FPC</option>
          <option value="impot_societes">IS</option>
        </select>
        <button onClick={charger} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} /> Actualiser
        </button>
        <button onClick={() => setModalBordereau(true)}
          className="flex items-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 bg-green-50 rounded-lg text-sm hover:bg-green-100">
          <Download size={14} /> Bordereau CNPS
        </button>
        <button onClick={() => setModalGenerer(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 ml-auto">
          <Plus size={14} /> Générer déclarations
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      {!loading && declarations && (
        declarations.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl">
            <Calculator size={48} className="mx-auto mb-3 opacity-30" />
            <p>Aucune déclaration trouvée. Commencez par générer les déclarations du mois.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Période</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-right px-4 py-3 font-medium">Base imposable</th>
                  <th className="text-right px-4 py-3 font-medium">Montant dû</th>
                  <th className="text-center px-4 py-3 font-medium">Échéance</th>
                  <th className="text-center px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-4 py-3 font-medium">Pénalité</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {declarations.map((d, i) => {
                  const enRetard   = d.statut === "en_retard";
                  const penalite   = parseFloat(d.penalite_retard_fcfa);
                  return (
                    <tr key={d.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""} ${enRetard ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{d.periode}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">{d.libelle}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {d.base_imposable_fcfa ? FCFA(d.base_imposable_fcfa) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {FCFA(d.montant_calcule_fcfa)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {d.date_echeance ? new Date(d.date_echeance + "T00:00:00").toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatutBadge statut={d.statut} joursRetard={d.jours_retard} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {penalite > 0 ? (
                          <span className="text-xs font-medium text-red-600">{FCFA(penalite)}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Payer */}
                          {d.statut !== "paye" && d.statut !== "exonere" && (
                            <button onClick={() => setModalPayer(d)}
                              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium whitespace-nowrap">
                              <CheckCircle2 size={12} /> Payer
                            </button>
                          )}
                          {d.type_taxe === "ppsi" && (
                            <>
                              <button onClick={() => void handleExportPpsiPdf(d)} title="Télécharger la PPSSI en PDF"
                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <span className="text-[10px] font-bold">PDF</span>
                              </button>
                              <button onClick={() => void handleExportPpsiExcel(d)} title="Télécharger la PPSSI en Excel"
                                className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <span className="text-[10px] font-bold">XLSX</span>
                              </button>
                            </>
                          )}
                          {d.statut === "paye" && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 size={12} /> {d.date_paiement ? new Date(d.date_paiement + "T00:00:00").toLocaleDateString("fr-FR") : "Payé"}
                            </span>
                          )}
                          {/* Recalculer — disponible si non payé */}
                          {d.statut !== "paye" && (
                            <button
                              onClick={() => void handleRecalculer(d)}
                              disabled={actionLoading === d.id}
                              title="Recalculer depuis les bulletins payés"
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                            >
                              {actionLoading === d.id
                                ? <div className="h-3 w-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                                : <RotateCcw size={13} />}
                            </button>
                          )}
                          {/* Supprimer — disponible si non payé */}
                          {d.statut !== "paye" && (
                            <button
                              onClick={() => void handleSupprimer(d)}
                              disabled={actionLoading === d.id}
                              title="Supprimer cette déclaration"
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalPayer && (
        <ModalPaiement decl={modalPayer} onClose={() => setModalPayer(null)} onDone={() => { setModalPayer(null); charger(); }} />
      )}
      {modalGenerer && (
        <ModalGenerer onClose={() => setModalGenerer(false)} onDone={() => { setModalGenerer(false); charger(); }} />
      )}
      {modalBordereau && (
        <ModalBordereauCnps onClose={() => setModalBordereau(false)} />
      )}
    </div>
  );
}

// ─── Onglet 3 — Rapport annuel ────────────────────────────────────────────────

function RapportAnnuel() {
  const { toast } = useToast();
  const [annee, setAnnee]     = useState(new Date().getFullYear());
  const [rapport, setRapport] = useState<RapportAnnuel | null>(null);
  const [loading, setLoading] = useState(false);

  const charger = useCallback(async (a?: number) => {
    const an = a ?? annee;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/rapport-annuel?annee=${an}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      setRapport(await r.json());
    } catch (e) {
      if (!navigator.onLine) return;
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [annee, toast]);

  useEffect(() => { charger(); }, []);

  const [pdfLoading, setPdfLoading] = useState(false);

  const telechargerPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/rapport-pdf?annee=${annee}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const blob = await r.blob();
      openPdfViewer(URL.createObjectURL(blob), `rapport-fiscal-${annee}.pdf`);
    } catch {
      // erreur silencieuse
    } finally {
      setPdfLoading(false);
    }
  };

  const categories: Record<string, string> = {
    cnps:               "CNPS",
    its:                "ITS",
    taxe_apprentissage: "Taxe d'apprentissage",
    fpc:                "FPC",
    impot_societes:     "Impôt sur les sociétés",
    autre:              "Autre",
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Exercice</label>
          <select value={annee} onChange={e => { const a = parseInt(e.target.value); setAnnee(a); charger(a); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            {[2023,2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button onClick={() => void telechargerPdf()}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          {pdfLoading
            ? <RefreshCw size={14} className="animate-spin" />
            : <Download size={14} />}
          Télécharger PDF
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      {!loading && rapport && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total déclaré", val: FCFA(rapport.totalCalcule), color: "bg-blue-600",  icon: Calculator },
              { label: "Total payé",    val: FCFA(rapport.totalPaye),    color: "bg-green-600", icon: CheckCircle2 },
              { label: "Pénalités",     val: FCFA(rapport.totalPenalite), color: rapport.totalPenalite > 0 ? "bg-red-600" : "bg-gray-400", icon: AlertTriangle },
            ].map(({ label, val, color, icon: Icon }) => (
              <div key={label} className={`${color} rounded-xl p-4 text-white`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} className="opacity-70" />
                  <p className="text-xs opacity-80">{label}</p>
                </div>
                <p className="text-xl font-bold">{val}</p>
              </div>
            ))}
          </div>

          {/* Tableau détaillé */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-700 text-sm">Détail par type de taxe — Exercice {annee}</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs border-t">
                  <th className="text-left px-5 py-3 font-medium">Taxe</th>
                  <th className="text-center px-4 py-3 font-medium">Périodicité</th>
                  <th className="text-center px-4 py-3 font-medium">Déclarations</th>
                  <th className="text-right px-4 py-3 font-medium">Montant déclaré</th>
                  <th className="text-right px-4 py-3 font-medium">Montant payé</th>
                  <th className="text-right px-4 py-3 font-medium">Pénalités</th>
                  <th className="text-center px-4 py-3 font-medium">Conformité</th>
                </tr>
              </thead>
              <tbody>
                {rapport.lignes.map((l, i) => {
                  const calcule  = parseFloat(l.montant_calcule_total);
                  const paye     = parseFloat(l.montant_paye_total);
                  const penalite = parseFloat(l.penalite_total);
                  const conforme = calcule === 0 || paye >= calcule;
                  return (
                    <tr key={i} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {categories[l.type_taxe] ?? l.libelle}
                        <p className="text-xs text-gray-400 font-normal">{l.libelle}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500 capitalize">{l.periodicite}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{l.nb_declarations}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{FCFA(calcule)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{FCFA(paye)}</td>
                      <td className="px-4 py-3 text-right">
                        {penalite > 0 ? <span className="text-red-600 font-medium">{FCFA(penalite)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {calcule === 0 ? (
                          <span className="text-xs text-gray-400">N/A</span>
                        ) : conforme ? (
                          <span className="text-xs text-green-600 font-medium">✓ Conforme</span>
                        ) : (
                          <span className="text-xs text-red-600 font-medium">✗ Incomplet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-green-50">
                  <td colSpan={3} className="px-5 py-3 font-bold text-gray-800">TOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">{FCFA(rapport.totalCalcule)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{FCFA(rapport.totalPaye)}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{rapport.totalPenalite > 0 ? FCFA(rapport.totalPenalite) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {rapport.totalCalcule > 0 && rapport.totalPaye >= rapport.totalCalcule && (
                      <span className="text-xs text-green-700 font-bold">✓ Tout payé</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            Document généré le {new Date().toLocaleDateString("fr-FR")} — À remettre à l'expert-comptable pour validation.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function FiscalitePage() {
  const [tab, setTab] = useState<"dashboard" | "declarations" | "rapport">("dashboard");

  const TABS = [
    { id: "dashboard"    as const, label: "Tableau de bord" },
    { id: "declarations" as const, label: "Déclarations" },
    { id: "rapport"      as const, label: "Rapport annuel" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Calculator size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fiscalité</h1>
             <p className="text-sm text-gray-400">CNPS, ITS, TA, FPC, TSE — obligations ivoiriennes</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard"    && <TableauBordFiscal />}
      {tab === "declarations" && <Declarations />}
      {tab === "rapport"      && <RapportAnnuel />}
    </div>
  );
}

function ModalObligationForm({
  obligation,
  onClose,
  onDone,
}: {
  obligation: Obligation | null;   // null = ajout
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const isEdit = obligation !== null;

  const [libelle,     setLibelle]     = useState(obligation?.libelle ?? "");
  const [typeTaxe,    setTypeTaxe]    = useState(obligation?.type_taxe ?? "cnps");
  const [periodicite, setPeriodicite] = useState(obligation?.periodicite ?? "mensuel");
  const [jourEcheance,setJourEcheance]= useState(String(obligation?.jour_echeance ?? "15"));
  const [tauxPct,     setTauxPct]     = useState(obligation?.taux_pct ?? "");
  const [baseCalcul,  setBaseCalcul]  = useState(obligation?.base_calcul ?? "");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!libelle.trim()) { toast({ title: "Libellé requis", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const body = {
        libelle: libelle.trim(),
        typeTaxe,
        periodicite,
        jourEcheance: jourEcheance ? parseInt(jourEcheance) : undefined,
        tauxPct: tauxPct.trim() || null,
        baseCalcul: baseCalcul.trim() || null,
      };
      const url = isEdit
        ? `${BASE}/api/fiscalite/obligations/${obligation!.id}`
        : `${BASE}/api/fiscalite/obligations`;
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: isEdit ? "Obligation modifiée" : "Obligation créée", description: libelle });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? "Modifier l'obligation" : "Ajouter une obligation fiscale"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Libellé */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Libellé *</label>
            <input
              type="text"
              value={libelle}
              onChange={e => setLibelle(e.target.value)}
              placeholder="Ex: CNPS — Part salariale"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Type taxe + Périodicité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de taxe *</label>
              <select value={typeTaxe} onChange={e => setTypeTaxe(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {TYPE_TAXE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Périodicité *</label>
              <select value={periodicite} onChange={e => setPeriodicite(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="mensuel">Mensuelle</option>
                <option value="trimestriel">Trimestrielle</option>
                <option value="annuel">Annuelle</option>
              </select>
            </div>
          </div>

          {/* Taux + Jour échéance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taux (%)</label>
              <input
                type="number"
                value={tauxPct}
                onChange={e => setTauxPct(e.target.value)}
                step="0.01"
                min="0"
                max="100"
                placeholder="Ex: 3.20"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Laisser vide si calculé manuellement</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jour d'échéance</label>
              <input
                type="number"
                value={jourEcheance}
                onChange={e => setJourEcheance(e.target.value)}
                min="1"
                max="31"
                placeholder="Ex: 15"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Jour du mois suivant (mensuel)</p>
            </div>
          </div>

          {/* Base de calcul */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base de calcul</label>
            <input
              type="text"
              value={baseCalcul}
              onChange={e => setBaseCalcul(e.target.value)}
              placeholder="Ex: Salaire brut plafonné"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
            {loading ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer l'obligation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionObligations({ onObligationsChange }: { onObligationsChange?: () => void }) {
  const { toast } = useToast();
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [toggling, setToggling]       = useState<number | null>(null);
  const [modalObl, setModalObl]       = useState<Obligation | null>(null);
  const [showModal, setShowModal]     = useState(false);
  // Confirmation désactivation
  const [confirmObl, setConfirmObl]   = useState<{ obl: Obligation; count: number } | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/obligations/all`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
      setObligations(await r.json());
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);

  const doToggle = async (obl: Obligation, confirme = false) => {
    setToggling(obl.id);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/obligations/${obl.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ confirme }),
      });
      const json = await r.json();
      // 409 = déclarations en attente → demander confirmation
      if (r.status === 409 && (json as { needsConfirmation?: boolean }).needsConfirmation) {
        const count = (json as { declarationsEnAttente: number }).declarationsEnAttente;
        setConfirmObl({ obl, count });
        return;
      }
      if (!r.ok) throw new Error((json as { error?: string }).error ?? "Erreur");
      toast({ title: (json as { actif: boolean }).actif ? "Obligation activée" : "Obligation désactivée", description: obl.libelle });
      charger();
      onObligationsChange?.();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setToggling(null); }
  };

  const handleToggle = (obl: Obligation) => void doToggle(obl, false);

  const handleConfirmDesactivation = async () => {
    if (!confirmObl) return;
    const obl = confirmObl.obl;
    setConfirmObl(null);
    await doToggle(obl, true);
  };

  const openAdd  = () => { setModalObl(null); setShowModal(true); };
  const openEdit = (o: Obligation) => { setModalObl(o); setShowModal(true); };
  const closeModal = () => setShowModal(false);
  const onDone = () => { closeModal(); charger(); onObligationsChange?.(); };

  const actives   = obligations?.filter(o => o.actif)  ?? [];
  const inactives = obligations?.filter(o => !o.actif) ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Settings size={16} className="text-green-600" /> Obligations fiscales configurées
        </h3>
        <div className="flex items-center gap-2">
          <InitObligationsButton onDone={() => { charger(); onObligationsChange?.(); }} />
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Si votre coopérative n’est pas assujettie à la TSE, utilisez le bouton d’activation situé sur sa ligne pour la désactiver.
        Les déclarations déjà créées restent conservées ; aucune nouvelle TSE ne sera générée tant qu’elle est inactive.
      </div>

      {loading && (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      {!loading && obligations && obligations.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">Aucune obligation configurée.</p>
          <p className="text-xs mt-1">Utilisez "Initialiser les obligations standard" ou "Ajouter" pour commencer.</p>
        </div>
      )}

      {!loading && obligations && obligations.length > 0 && (
        <div className="space-y-4">
          {/* Actives */}
          {actives.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Actives ({actives.length})</p>
              <div className="divide-y divide-gray-50">
                {actives.map(obl => (
                  <div key={obl.id} className="flex items-center justify-between py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{obl.libelle}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-gray-500">{typeTaxeLabel(obl.type_taxe)}</span>
                        <span className="text-xs text-gray-400 capitalize">{obl.periodicite}</span>
                        {obl.taux_pct && <span className="text-xs text-blue-600 font-medium">{obl.taux_pct}%</span>}
                        {obl.jour_echeance && <span className="text-xs text-gray-400">J-{obl.jour_echeance}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <button
                        onClick={() => openEdit(obl)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Modifier">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleToggle(obl)}
                        disabled={toggling === obl.id}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium transition-colors disabled:opacity-50"
                        title="Désactiver">
                        {toggling === obl.id
                          ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent" />
                          : <ToggleRight size={20} className="text-green-500" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inactives */}
          {inactives.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-2">Inactives ({inactives.length})</p>
              <div className="divide-y divide-gray-50">
                {inactives.map(obl => (
                  <div key={obl.id} className="flex items-center justify-between py-3 opacity-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-500 truncate">{obl.libelle}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-gray-400">{typeTaxeLabel(obl.type_taxe)}</span>
                        <span className="text-xs text-gray-400 capitalize">{obl.periodicite}</span>
                        {obl.taux_pct && <span className="text-xs text-gray-400">{obl.taux_pct}%</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <button
                        onClick={() => openEdit(obl)}
                        className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors opacity-100"
                        title="Modifier">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleToggle(obl)}
                        disabled={toggling === obl.id}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 font-medium transition-colors disabled:opacity-50 opacity-100"
                        title="Réactiver">
                        {toggling === obl.id
                          ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                          : <ToggleLeft size={20} className="text-gray-400" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ModalObligationForm
          obligation={modalObl}
          onClose={closeModal}
          onDone={onDone}
        />
      )}

      {/* Modal de confirmation désactivation */}
      {confirmObl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Désactiver l'obligation ?</h2>
                <p className="text-sm text-gray-500 mt-1">{confirmObl.obl.libelle}</p>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                <p className="font-medium mb-1">
                  {confirmObl.count} déclaration{confirmObl.count > 1 ? "s" : ""} non payée{confirmObl.count > 1 ? "s" : ""} en attente
                </p>
                <p className="text-xs">
                  Ces déclarations ({confirmObl.count > 1 ? "statuts « à payer » ou « en retard »" : "statut « à payer » ou « en retard »"}) resteront
                  dans votre liste après la désactivation. Elles ne seront plus générées automatiquement lors des prochaines périodes.
                </p>
              </div>
              <p className="text-sm text-gray-600">Souhaitez-vous quand même désactiver cette obligation ?</p>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setConfirmObl(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => void handleConfirmDesactivation()}
                disabled={toggling === confirmObl.obl.id}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50">
                {toggling === confirmObl.obl.id ? "Désactivation…" : "Désactiver quand même"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const typeTaxeLabel = (t: string) => TYPE_TAXE_OPTIONS.find(o => o.value === t)?.label ?? t;

const MOIS_EXPORT: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};
