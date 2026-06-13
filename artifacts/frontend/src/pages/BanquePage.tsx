import { useState, useCallback, useEffect } from "react";
import {
  Building2, Plus, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, ChevronRight, X, Check, Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/ui/money-input";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";

const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

const DATE_FR = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR");

const MOTIFS_CREDIT = [
  { value: "virement_entrant",   label: "Virement entrant" },
  { value: "depot_especes",      label: "Dépôt espèces (depuis caisse)" },
  { value: "remboursement_recu", label: "Remboursement reçu" },
  { value: "autre_credit",       label: "Autre crédit" },
];
const MOTIFS_DEBIT = [
  { value: "virement_sortant",      label: "Virement sortant" },
  { value: "retrait_especes",       label: "Retrait espèces (vers caisse)" },
  { value: "frais_bancaires",       label: "Frais bancaires" },
  { value: "remboursement_emprunt", label: "Remboursement emprunt" },
  { value: "autre_debit",           label: "Autre débit" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Compte {
  id: number;
  nom: string;
  banque: string;
  numero_compte: string | null;
  iban: string | null;
  solde_actuel_fcfa: string;
  solde_mini_alerte_fcfa: string;
  actif: boolean;
}

interface Mouvement {
  id: number;
  type: "credit" | "debit";
  motif: string;
  montant_fcfa: string;
  libelle: string | null;
  reference: string | null;
  date_operation: string;
  date_valeur: string | null;
  solde_apres_fcfa: string | null;
  rapproche: boolean;
  enregistre_par_nom: string | null;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BanquePage() {
  const { toast }       = useToast();
  const { utilisateur } = useAuth();
  const canEdit = utilisateur?.role !== "auditeur";

  const [comptes,         setComptes]         = useState<Compte[]>([]);
  const [selected,        setSelected]        = useState<Compte | null>(null);
  const [mouvements,      setMouvements]      = useState<Mouvement[]>([]);
  const [loadingComptes,  setLoadingComptes]  = useState(false);
  const [loadingJournal,  setLoadingJournal]  = useState(false);

  // Filtres journal
  const [dateDebut,      setDateDebut]      = useState("");
  const [dateFin,        setDateFin]        = useState("");
  const [filterType,     setFilterType]     = useState("tous");
  const [nonRapproche,   setNonRapproche]   = useState(false);

  // Modals
  const [showCreerCompte,     setShowCreerCompte]     = useState(false);
  const [showMouvement,       setShowMouvement]       = useState(false);
  const [showRapprochement,   setShowRapprochement]   = useState(false);
  const [editCompte,          setEditCompte]          = useState<Compte | null>(null);

  // Sélection rapprochement
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set());
  const [rappLoading,  setRappLoading]  = useState(false);

  // ─── Chargement comptes ───────────────────────────────────────────────────

  const chargerComptes = useCallback(async () => {
    setLoadingComptes(true);
    try {
      const r = await fetch(`${BASE}/api/banque`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error();
      const data: Compte[] = await r.json();
      setComptes(data);
      if (selected) {
        const fresh = data.find(c => c.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les comptes bancaires", variant: "destructive" });
    } finally {
      setLoadingComptes(false);
    }
  }, [selected, toast]);

  useEffect(() => { chargerComptes(); }, []);

  // ─── Chargement journal ───────────────────────────────────────────────────

  const chargerJournal = useCallback(async (compteId: number) => {
    setLoadingJournal(true);
    try {
      const params = new URLSearchParams();
      if (dateDebut) params.set("dateDebut", dateDebut);
      if (dateFin)   params.set("dateFin",   dateFin);
      if (filterType !== "tous") params.set("type", filterType);
      if (nonRapproche) params.set("nonRapproche", "1");
      const r = await fetch(`${BASE}/api/banque/${compteId}/journal?${params}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error();
      setMouvements(await r.json());
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger le journal", variant: "destructive" });
    } finally {
      setLoadingJournal(false);
    }
  }, [dateDebut, dateFin, filterType, nonRapproche, toast]);

  useEffect(() => {
    if (selected) chargerJournal(selected.id);
  }, [selected, dateDebut, dateFin, filterType, nonRapproche]);

  // ─── Rapprochement ────────────────────────────────────────────────────────

  const mouvNonRappro = mouvements.filter(m => !m.rapproche);

  const toggleId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRapprocher = async () => {
    if (!selected || selectedIds.size === 0) return;
    setRappLoading(true);
    try {
      const r = await fetch(`${BASE}/api/banque/${selected.id}/rapprocher`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Rapprochement enregistré", description: `${selectedIds.size} mouvement(s) pointé(s)` });
      setSelectedIds(new Set());
      setShowRapprochement(false);
      chargerJournal(selected.id);
      chargerComptes();
    } catch {
      toast({ title: "Erreur", description: "Rapprochement échoué", variant: "destructive" });
    } finally {
      setRappLoading(false);
    }
  };

  // ─── Solde non rapproché ──────────────────────────────────────────────────

  const soldeNonRapproche = mouvNonRappro.reduce((acc, m) => {
    const val = parseFloat(m.montant_fcfa);
    return m.type === "credit" ? acc + val : acc - val;
  }, 0);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selected && (
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
              <ChevronRight className="rotate-180 h-5 w-5" />
            </button>
          )}
          <Building2 className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {selected ? selected.nom : "Comptes bancaires"}
          </h1>
        </div>
        <div className="flex gap-2">
          {selected && canEdit && (
            <>
              <button
                onClick={() => setShowRapprochement(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Rapprocher
              </button>
              <button
                onClick={() => setShowMouvement(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Mouvement
              </button>
            </>
          )}
          {!selected && canEdit && (
            <button
              onClick={() => { setEditCompte(null); setShowCreerCompte(true); }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nouveau compte
            </button>
          )}
          <button onClick={selected ? () => chargerJournal(selected.id) : chargerComptes} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 text-gray-500 ${loadingComptes || loadingJournal ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Vue liste des comptes ── */}
      {!selected && (
        <>
          {comptes.length === 0 && !loadingComptes && (
            <div className="text-center py-16 text-gray-400">
              <Building2 className="mx-auto h-12 w-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">Aucun compte bancaire</p>
              <p className="text-sm mt-1">Créez votre premier compte pour commencer</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comptes.map(c => {
              const solde   = parseFloat(c.solde_actuel_fcfa);
              const mini    = parseFloat(c.solde_mini_alerte_fcfa);
              const alerte  = mini > 0 && solde < mini;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{c.nom}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{c.banque}</p>
                      {c.numero_compte && <p className="text-xs text-gray-400 mt-0.5 font-mono">{c.numero_compte}</p>}
                    </div>
                    {alerte && <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />}
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Solde actuel</p>
                    <p className={`text-2xl font-bold mt-1 ${alerte ? "text-amber-600" : "text-gray-900"}`}>
                      {FCFA(c.solde_actuel_fcfa)}
                    </p>
                    {alerte && (
                      <p className="text-xs text-amber-600 mt-1">⚠️ Sous le seuil ({FCFA(c.solde_mini_alerte_fcfa)})</p>
                    )}
                  </div>
                  {c.iban && <p className="text-xs text-gray-400 mt-3 font-mono truncate">{c.iban}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    {canEdit && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditCompte(c); setShowCreerCompte(true); }}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Modifier
                      </button>
                    )}
                    <span className="text-xs text-blue-600 ml-auto">Voir le journal →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Vue journal d'un compte ── */}
      {selected && (
        <div className="space-y-4">

          {/* Résumé compte */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Solde actuel</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{FCFA(selected.solde_actuel_fcfa)}</p>
              </div>
              {mouvNonRappro.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Non rapproché</p>
                  <p className={`text-lg font-semibold mt-1 ${soldeNonRapproche >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {soldeNonRapproche >= 0 ? "+" : ""}{FCFA(Math.abs(soldeNonRapproche))}
                    <span className="text-xs text-gray-400 font-normal ml-1">({mouvNonRappro.length} ligne(s))</span>
                  </p>
                </div>
              )}
              {selected.iban && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">IBAN / RIB</p>
                  <p className="text-sm font-mono text-gray-700 mt-1">{selected.iban}</p>
                </div>
              )}
            </div>
          </div>

          {/* Filtres */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Filter className="h-4 w-4 text-gray-400" />
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">Du</label>
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">Au</label>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1" />
              </div>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="text-sm border border-gray-200 rounded px-2 py-1">
                <option value="tous">Tous les types</option>
                <option value="credit">Crédits</option>
                <option value="debit">Débits</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={nonRapproche} onChange={e => setNonRapproche(e.target.checked)}
                  className="rounded" />
                Non rapprochés seulement
              </label>
              {(dateDebut || dateFin || filterType !== "tous" || nonRapproche) && (
                <button onClick={() => { setDateDebut(""); setDateFin(""); setFilterType("tous"); setNonRapproche(false); }}
                  className="text-xs text-gray-400 hover:text-red-500">
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Table mouvements */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingJournal ? (
              <div className="py-12 text-center text-gray-400 text-sm">Chargement…</div>
            ) : mouvements.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Aucun mouvement pour cette période</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date op.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Libellé</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Référence</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Crédit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Débit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Solde après</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rappr.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mouvements.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <div>{DATE_FR(m.date_operation)}</div>
                        {m.date_valeur && m.date_valeur !== m.date_operation && (
                          <div className="text-xs text-gray-400">Valeur: {DATE_FR(m.date_valeur)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-800">{m.libelle ?? LABEL_MOTIF(m.type, m.motif)}</div>
                        <div className="text-xs text-gray-400">{LABEL_MOTIF(m.type, m.motif)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{m.reference ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {m.type === "credit" ? (
                          <span className="font-medium text-green-700">
                            <TrendingUp className="inline h-3 w-3 mr-1" />
                            {FCFA(m.montant_fcfa)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.type === "debit" ? (
                          <span className="font-medium text-red-600">
                            <TrendingDown className="inline h-3 w-3 mr-1" />
                            {FCFA(m.montant_fcfa)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {m.solde_apres_fcfa ? FCFA(m.solde_apres_fcfa) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.rapproche
                          ? <Check className="mx-auto h-4 w-4 text-green-500" />
                          : <div className="mx-auto h-4 w-4 rounded border border-gray-300" />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Modal : Créer / Modifier compte ── */}
      {showCreerCompte && (
        <ModalCreerCompte
          compte={editCompte}
          onClose={() => { setShowCreerCompte(false); setEditCompte(null); }}
          onSaved={() => { setShowCreerCompte(false); setEditCompte(null); chargerComptes(); }}
          toast={toast}
        />
      )}

      {/* ── Modal : Nouveau mouvement ── */}
      {showMouvement && selected && (
        <ModalMouvement
          compte={selected}
          onClose={() => setShowMouvement(false)}
          onSaved={() => { setShowMouvement(false); chargerJournal(selected.id); chargerComptes(); }}
          toast={toast}
        />
      )}

      {/* ── Modal : Rapprochement ── */}
      {showRapprochement && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Rapprochement bancaire — {selected.nom}</h2>
              <button onClick={() => { setShowRapprochement(false); setSelectedIds(new Set()); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {mouvNonRappro.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Tous les mouvements sont déjà rapprochés ✓</p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    Cochez les lignes présentes sur votre relevé bancaire pour les marquer comme rapprochées.
                  </p>
                  <div className="space-y-2">
                    {mouvNonRappro.map(m => (
                      <label key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleId(m.id)}
                          className="h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">{m.libelle ?? LABEL_MOTIF(m.type, m.motif)}</span>
                            <span className={`text-sm font-semibold ${m.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                              {m.type === "credit" ? "+" : "-"}{FCFA(m.montant_fcfa)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {DATE_FR(m.date_operation)}{m.reference ? ` · ${m.reference}` : ""}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            {mouvNonRappro.length > 0 && (
              <div className="p-6 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">{selectedIds.size} ligne(s) sélectionnée(s)</span>
                <div className="flex gap-3">
                  <button onClick={() => { setShowRapprochement(false); setSelectedIds(new Set()); }}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                    Annuler
                  </button>
                  <button
                    onClick={handleRapprocher}
                    disabled={selectedIds.size === 0 || rappLoading}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {rappLoading ? "En cours…" : "Pointer la sélection"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper motif label ────────────────────────────────────────────────────────

const ALL_MOTIFS = [...MOTIFS_CREDIT, ...MOTIFS_DEBIT];
function LABEL_MOTIF(_type: string, motif: string) {
  return ALL_MOTIFS.find(m => m.value === motif)?.label ?? motif;
}

// ─── Modal : Créer / Modifier compte ──────────────────────────────────────────

function ModalCreerCompte({
  compte, onClose, onSaved, toast,
}: {
  compte: Compte | null;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [nom,             setNom]             = useState(compte?.nom ?? "");
  const [banque,          setBanque]          = useState(compte?.banque ?? "");
  const [numeroCompte,    setNumeroCompte]    = useState(compte?.numero_compte ?? "");
  const [iban,            setIban]            = useState(compte?.iban ?? "");
  const [soldeInitial,    setSoldeInitial]    = useState(compte ? "" : "0");
  const [soldeMini,       setSoldeMini]       = useState(
    compte ? String(parseFloat(compte.solde_mini_alerte_fcfa) || 0) : "0"
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !banque.trim()) return;
    setLoading(true);
    try {
      const url    = compte ? `${BASE}/api/banque/${compte.id}` : `${BASE}/api/banque`;
      const method = compte ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        nom: nom.trim(),
        banque: banque.trim(),
        numeroCompte: numeroCompte.trim() || undefined,
        iban: iban.trim() || undefined,
        soldeMiniAlerte: parseInt(soldeMini || "0"),
      };
      if (!compte) body["soldeInitial"] = parseInt(soldeInitial || "0");
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).erreur ?? "Erreur serveur");
      toast({ title: compte ? "Compte modifié" : "Compte créé", description: nom });
      onSaved();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur serveur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{compte ? "Modifier le compte" : "Nouveau compte bancaire"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du compte *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} required placeholder="ex: Compte principal BNI"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banque *</label>
            <input value={banque} onChange={e => setBanque(e.target.value)} required placeholder="ex: BNI, SGBCI, Ecobank…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de compte</label>
            <input value={numeroCompte} onChange={e => setNumeroCompte(e.target.value)} placeholder="ex: CI0123456789"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IBAN / RIB</label>
            <input value={iban} onChange={e => setIban(e.target.value)} placeholder="Optionnel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {!compte && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Solde initial (FCFA)</label>
              <MoneyInput value={soldeInitial} onChange={v => setSoldeInitial(v ?? "0")} placeholder="0" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seuil d'alerte (FCFA)</label>
            <MoneyInput value={soldeMini} onChange={v => setSoldeMini(v ?? "0")} placeholder="0" />
            <p className="text-xs text-gray-400 mt-1">Alerte si le solde passe sous ce seuil (0 = pas d'alerte)</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Enregistrement…" : compte ? "Modifier" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal : Nouveau mouvement ─────────────────────────────────────────────────

function ModalMouvement({
  compte, onClose, onSaved, toast,
}: {
  compte: Compte;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [type,          setType]          = useState<"credit" | "debit">("credit");
  const [motif,         setMotif]         = useState("virement_entrant");
  const [montant,       setMontant]       = useState("");
  const [libelle,       setLibelle]       = useState("");
  const [reference,     setReference]     = useState("");
  const [dateOp,        setDateOp]        = useState(new Date().toISOString().slice(0, 10));
  const [dateValeur,    setDateValeur]    = useState("");
  const [loading,       setLoading]       = useState(false);

  const motifs = type === "credit" ? MOTIFS_CREDIT : MOTIFS_DEBIT;

  const handleTypeChange = (t: "credit" | "debit") => {
    setType(t);
    setMotif(t === "credit" ? "virement_entrant" : "virement_sortant");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montantInt = parseInt(montant || "0");
    if (!montantInt) { toast({ title: "Montant requis", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/banque/${compte.id}/mouvement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          type, motif, montantFcfa: montantInt,
          libelle: libelle.trim() || undefined,
          reference: reference.trim() || undefined,
          dateOperation: dateOp,
          dateValeur: dateValeur || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).erreur ?? "Erreur serveur");
      const data = await r.json();
      toast({
        title: type === "credit" ? "Crédit enregistré" : "Débit enregistré",
        description: data.alerte ?? FCFA(montantInt),
      });
      onSaved();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur serveur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">Nouveau mouvement — {compte.nom}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Type crédit / débit */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => handleTypeChange("credit")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                type === "credit" ? "bg-green-50 border-green-400 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              <TrendingUp className="h-4 w-4" /> Crédit
            </button>
            <button type="button"
              onClick={() => handleTypeChange("debit")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                type === "debit" ? "bg-red-50 border-red-400 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              <TrendingDown className="h-4 w-4" /> Débit
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif *</label>
            <select value={motif} onChange={e => setMotif(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {motifs.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant (FCFA) *</label>
            <MoneyInput value={montant} onChange={v => setMontant(v ?? "")} placeholder="0" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Libellé</label>
            <input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Description du mouvement"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Référence</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° virement, chèque…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d'opération *</label>
              <input type="date" value={dateOp} onChange={e => setDateOp(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de valeur</label>
              <input type="date" value={dateValeur} onChange={e => setDateValeur(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Solde prévisionnel */}
          {montant && parseInt(montant) > 0 && (
            <div className={`rounded-lg p-3 text-sm ${type === "credit" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              Solde après opération :{" "}
              <strong>
                {FCFA(
                  type === "credit"
                    ? parseFloat(compte.solde_actuel_fcfa) + parseInt(montant)
                    : parseFloat(compte.solde_actuel_fcfa) - parseInt(montant)
                )}
              </strong>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className={`flex-1 py-2 text-white rounded-lg text-sm disabled:opacity-50 ${
                type === "credit" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}>
              {loading ? "Enregistrement…" : type === "credit" ? "Enregistrer crédit" : "Enregistrer débit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
