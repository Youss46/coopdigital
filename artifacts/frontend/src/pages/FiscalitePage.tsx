import { useState, useCallback, useEffect } from "react";
import { Calculator, AlertTriangle, CheckCircle2, Clock, Download, Plus, RefreshCw, X, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("authToken") ?? "";
const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

const MOIS_NOMS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
                   "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Declaration {
  id: number; periode: string; base_imposable_fcfa: string | null;
  montant_calcule_fcfa: string; montant_paye_fcfa: string;
  date_echeance: string | null; date_paiement: string | null;
  reference_paiement: string | null; statut: string;
  penalite_retard_fcfa: string; document_url: string | null;
  type_taxe: string; libelle: string; periodicite: string;
  jours_retard: number | null;
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
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!montant || parseInt(montant) <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fiscalite/declarations/${decl.id}/payer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ montantPaye: parseInt(montant), reference, datePaiement }),
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant payé (FCFA) *</label>
            <input type="number" value={montant} onChange={e => setMontant(e.target.value)} min="0"
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
      const nb = Array.isArray(json) ? json.length : 0;
      toast({ title: "Déclarations générées", description: `${nb} déclaration(s) créée(s)${nb === 0 ? " (déjà existantes)" : ""}.` });
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

// ─── Onglet 1 — Tableau de bord fiscal ───────────────────────────────────────

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
    } catch (e) { toast({ title: "Erreur chargement", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
    finally { setLoading(false); }
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
          <p className="text-sm text-gray-400 text-center py-8">Aucune déclaration à venir. Générez les déclarations du mois.</p>
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
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [filtreStatut, filtreType, toast]);

  useEffect(() => { charger(); }, [charger]);

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
                        {d.statut !== "paye" && d.statut !== "exonere" && (
                          <button onClick={() => setModalPayer(d)}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium whitespace-nowrap">
                            <CheckCircle2 size={12} /> Payer
                          </button>
                        )}
                        {d.statut === "paye" && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 size={12} /> {d.date_paiement ? new Date(d.date_paiement + "T00:00:00").toLocaleDateString("fr-FR") : "Payé"}
                          </span>
                        )}
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
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [annee, toast]);

  useEffect(() => { charger(); }, []);

  const telechargerPdf = () => {
    const a = document.createElement("a");
    fetch(`${BASE}/api/fiscalite/rapport-pdf?annee=${annee}`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.blob()).then(blob => {
        a.href = URL.createObjectURL(blob);
        a.download = `rapport-fiscal-${annee}.pdf`;
        a.click();
      });
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
        <button onClick={telechargerPdf}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Download size={14} /> Télécharger PDF
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
          <p className="text-sm text-gray-400">CNPS, ITS, TA, FPC — obligations ivoiriennes</p>
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
