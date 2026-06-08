import { useState, useCallback, useRef, useEffect } from "react";
import { GitMerge, Upload, CheckCircle2, AlertTriangle, HelpCircle, X, Download, RefreshCw, Search, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("authToken") ?? "";
const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Releve {
  id: number; banque: string; numero_compte: string | null; statut: string;
  periode_debut: string | null; periode_fin: string | null;
  solde_debut_fcfa: string; solde_fin_fcfa: string; created_at: string;
  importeur_nom: string | null; nb_lignes: string;
  nb_reconciliees: string; nb_non_reconciliees: string;
}

interface LigneReleve {
  id: number; date_operation: string; libelle_banque: string;
  montant_fcfa: string; type: string; reference_banque: string | null;
  statut_reconciliation: string; ecriture_id: number | null; ecart_fcfa: string;
  motif_ignore: string | null;
  ecriture_libelle: string | null; ecriture_date: string | null;
}

interface Ecriture {
  id: number; date_ecriture: string; libelle: string;
  compte_debit: string; compte_credit: string; montant_fcfa: number;
}

// ─── Statut badge ─────────────────────────────────────────────────────────────

function StatutLigneBadge({ statut }: { statut: string }) {
  const cfg: Record<string, { cls: string; label: string; icon: string }> = {
    reconciliee:      { cls: "bg-green-100 text-green-700",  label: "Réconciliée",      icon: "✅" },
    a_justifier:      { cls: "bg-amber-100 text-amber-700",  label: "À vérifier",       icon: "⚠️" },
    non_reconciliee:  { cls: "bg-red-100 text-red-700",      label: "Non réconciliée",  icon: "❓" },
    ignoree:          { cls: "bg-gray-100 text-gray-500",    label: "Ignorée",          icon: "—" },
  };
  const { cls, label, icon } = cfg[statut] ?? { cls: "bg-gray-100 text-gray-500", label: statut, icon: "?" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      <span>{icon}</span> {label}
    </span>
  );
}

function StatutReleveBadge({ statut }: { statut: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    importe:    { cls: "bg-blue-100 text-blue-700",   label: "Importé" },
    en_cours:   { cls: "bg-amber-100 text-amber-700", label: "En cours" },
    reconcilie: { cls: "bg-green-100 text-green-700", label: "Réconcilié" },
  };
  const { cls, label } = cfg[statut] ?? { cls: "bg-gray-100 text-gray-500", label: statut };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ─── Modal réconciliation manuelle ────────────────────────────────────────────

function ModalReconcilier({
  ligne, onClose, onDone,
}: { ligne: LigneReleve; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [q, setQ]           = useState("");
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [selected, setSelected]   = useState<Ecriture | null>(null);
  const [loading, setLoading]     = useState(false);

  const rechercher = useCallback(async () => {
    const montant = Math.round(parseFloat(ligne.montant_fcfa));
    const url = `${BASE}/api/reconciliation/ecritures?q=${encodeURIComponent(q)}&montant=${montant}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
    if (r.ok) setEcritures(await r.json());
  }, [q, ligne.montant_fcfa]);

  useEffect(() => { rechercher(); }, []);

  const confirmer = async () => {
    if (!selected) { toast({ title: "Sélectionnez une écriture", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/reconciliation/lignes/${ligne.id}/reconcilier`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ ecriture_id: selected.id }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      toast({ title: "Ligne réconciliée" });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Réconcilier manuellement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-800">{ligne.libelle_banque}</p>
            <p className="text-gray-500">{ligne.date_operation} — {ligne.type === "debit" ? "Débit" : "Crédit"} {FCFA(ligne.montant_fcfa)}</p>
          </div>
          <div className="flex gap-2">
            <input type="text" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && rechercher()}
              placeholder="Rechercher dans les écritures comptables…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={rechercher}
              className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
              <Search size={14} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {ecritures.length === 0 ? (
              <p className="text-sm text-gray-400 p-4 text-center">Aucune écriture trouvée</p>
            ) : ecritures.map(e => (
              <button key={e.id} onClick={() => setSelected(e)}
                className={`w-full text-left p-3 hover:bg-blue-50 transition-colors ${selected?.id === e.id ? "bg-blue-50 border-l-2 border-blue-600" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{e.libelle}</p>
                  <p className={`text-sm font-bold ${Math.abs(e.montant_fcfa) === Math.round(parseFloat(ligne.montant_fcfa)) ? "text-green-600" : "text-gray-700"}`}>
                    {FCFA(Math.abs(e.montant_fcfa))}
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {e.date_ecriture} | Débit : {e.compte_debit} / Crédit : {e.compte_credit}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={confirmer} disabled={!selected || loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Enregistrement…" : "Confirmer la réconciliation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Ignorer ────────────────────────────────────────────────────────────

function ModalIgnorer({
  ligne, onClose, onDone,
}: { ligne: LigneReleve; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);

  const confirmer = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/reconciliation/lignes/${ligne.id}/ignorer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ motif }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      toast({ title: "Ligne ignorée" });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Ignorer cette ligne</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-800">{ligne.libelle_banque}</p>
            <p className="text-gray-500">{ligne.date_operation} — {FCFA(ligne.montant_fcfa)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif (facultatif)</label>
            <input type="text" value={motif} onChange={e => setMotif(e.target.value)}
              placeholder="Ex: frais bancaires déjà enregistrés…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={confirmer} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gray-600 hover:bg-gray-700">
            {loading ? "Enregistrement…" : "Ignorer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 1 — Import ────────────────────────────────────────────────────────

function ImportReleve() {
  const { toast } = useToast();
  const inputRef  = useRef<HTMLInputElement>(null);

  const [file, setFile]           = useState<File | null>(null);
  const [dragging, setDragging]   = useState(false);
  const [preview, setPreview]     = useState<{ headers: string[]; preview: unknown[][] } | null>(null);
  const [banque, setBanque]       = useState("");
  const [compte, setCompte]       = useState("");
  const [colMapping, setColMapping] = useState<Record<string, string>>({});
  const [needMapping, setNeedMapping] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult]       = useState<{ nb_lignes_importees: number; erreurs: string[] } | null>(null);

  const COL_KEYS = [
    { key: "date",      label: "Colonne Date" },
    { key: "libelle",   label: "Colonne Libellé" },
    { key: "debit",     label: "Colonne Débit" },
    { key: "credit",    label: "Colonne Crédit" },
    { key: "reference", label: "Colonne Référence" },
  ];

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append("fichier", f);
      const r = await fetch(`${BASE}/api/reconciliation/preview`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` }, body: form,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Erreur preview"); }
      const data = await r.json() as { headers: string[]; preview: unknown[][] };
      setPreview(data);

      // Vérifier si mapping nécessaire (colonnes débit/crédit ou montant non détectées)
      const h = data.headers.map((x: string) => x.toLowerCase());
      const hasDebit  = h.some(v => v.includes("débit") || v.includes("debit") || v.includes("retrait"));
      const hasCredit = h.some(v => v.includes("crédit") || v.includes("credit") || v.includes("versement"));
      const hasMontant = h.some(v => v.includes("montant") || v.includes("amount"));
      const hasDate   = h.some(v => v.includes("date") || v.includes("dt"));
      setNeedMapping(!hasDate || (!hasDebit && !hasMontant) || (!hasCredit && !hasMontant));
    } catch (e) {
      toast({ title: "Erreur lecture", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setPreviewing(false); }
  };

  const importer = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("fichier", file);
      if (banque) form.append("banque", banque);
      if (compte) form.append("numero_compte", compte);
      if (needMapping && Object.keys(colMapping).length > 0) {
        form.append("user_mapping", JSON.stringify(colMapping));
      }
      const r = await fetch(`${BASE}/api/reconciliation/importer`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` }, body: form,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      setResult(json);
      setFile(null); setPreview(null); setNeedMapping(false);
    } catch (e) {
      toast({ title: "Erreur import", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setImporting(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div className="space-y-5">
      {/* Résultat import */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="font-semibold text-green-800">Import réussi !</p>
          </div>
          <p className="text-sm text-green-700">{result.nb_lignes_importees} ligne(s) importée(s).</p>
          {result.erreurs.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-amber-700 cursor-pointer">{result.erreurs.length} ligne(s) ignorée(s)</summary>
              <ul className="text-xs text-gray-500 mt-1 space-y-0.5 pl-3">
                {result.erreurs.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Zone dépôt */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <Upload size={36} className="mx-auto mb-3 text-gray-300" />
        <p className="font-medium text-gray-600">
          {file ? file.name : "Glissez votre relevé ici ou cliquez pour choisir"}
        </p>
        <p className="text-sm text-gray-400 mt-1">Formats acceptés : CSV (;  ,) ou Excel (.xlsx, .xls)</p>
        {previewing && <p className="text-sm text-blue-500 mt-2">Analyse en cours…</p>}
      </div>

      {/* Paramètres */}
      {file && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banque</label>
            <input type="text" value={banque} onChange={e => setBanque(e.target.value)}
              placeholder="Ex: SGBCI, ECOBANK…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° de compte</label>
            <input type="text" value={compte} onChange={e => setCompte(e.target.value)}
              placeholder="Ex: CI-ABC-12345"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {/* Mapping colonnes si besoin */}
      {needMapping && preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-3">
            ⚠️ Colonnes non détectées automatiquement — mappez-les ci-dessous :
          </p>
          <div className="grid grid-cols-2 gap-3">
            {COL_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <select value={colMapping[key] ?? ""}
                  onChange={e => setColMapping(m => ({ ...m, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— Ignorer —</option>
                  {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu données */}
      {preview && preview.preview.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <p className="text-sm font-medium text-gray-700">Aperçu — {preview.preview.length} premières lignes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  {preview.headers.map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                    {(row as unknown[]).map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-40 truncate">
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bouton import */}
      {file && (
        <button onClick={importer} disabled={importing}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          <Upload size={16} />
          {importing ? "Import en cours…" : "Importer le relevé"}
        </button>
      )}
    </div>
  );
}

// ─── Onglet 2 — Réconciliation ─────────────────────────────────────────────────

function Reconciliation() {
  const { toast } = useToast();
  const [releves, setReleves]         = useState<Releve[] | null>(null);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [detail, setDetail]           = useState<{ releve: Releve; lignes: LigneReleve[] } | null>(null);
  const [autoResult, setAutoResult]   = useState<{ nb_reconciliees: number; nb_a_justifier: number; nb_non_reconciliees: number } | null>(null);
  const [running, setRunning]         = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [modalReconc, setModalReconc] = useState<LigneReleve | null>(null);
  const [modalIgnorer, setModalIgnorer] = useState<LigneReleve | null>(null);

  const chargerReleves = useCallback(async () => {
    const r = await fetch(`${BASE}/api/reconciliation/releves`, { headers: { Authorization: `Bearer ${tok()}` } });
    if (r.ok) setReleves(await r.json());
  }, []);

  const chargerDetail = useCallback(async (id: number) => {
    setLoadingDetail(true); setAutoResult(null);
    const r = await fetch(`${BASE}/api/reconciliation/${id}`, { headers: { Authorization: `Bearer ${tok()}` } });
    if (r.ok) setDetail(await r.json());
    setLoadingDetail(false);
  }, []);

  useEffect(() => { chargerReleves(); }, [chargerReleves]);

  useEffect(() => {
    if (selectedId) chargerDetail(selectedId);
  }, [selectedId, chargerDetail]);

  const lancerAuto = async () => {
    if (!selectedId) return;
    setRunning(true);
    try {
      const r = await fetch(`${BASE}/api/reconciliation/${selectedId}/auto`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      const res = await r.json();
      setAutoResult(res);
      await chargerDetail(selectedId);
      await chargerReleves();
      toast({
        title: "Réconciliation automatique terminée",
        description: `✅ ${res.nb_reconciliees} réconciliées | ⚠️ ${res.nb_a_justifier} à vérifier | ❓ ${res.nb_non_reconciliees} non réconciliées`,
      });
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setRunning(false); }
  };

  const telechargerPdf = () => {
    if (!selectedId) return;
    const a = document.createElement("a");
    fetch(`${BASE}/api/reconciliation/${selectedId}/rapport-pdf`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.blob()).then(blob => {
        a.href = URL.createObjectURL(blob);
        a.download = `reconciliation-${selectedId}.pdf`;
        a.click();
      });
  };

  const lignesFiltrees = detail?.lignes.filter(l =>
    filtreStatut ? l.statut_reconciliation === filtreStatut : true
  ) ?? [];

  return (
    <div className="space-y-5">
      {/* Sélecteur relevé */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Relevé bancaire</label>
            <select value={selectedId ?? ""} onChange={e => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Sélectionner un relevé…</option>
              {(releves ?? []).map(r => (
                <option key={r.id} value={r.id}>
                  {r.banque} {r.numero_compte ? `N°${r.numero_compte}` : ""} — {r.periode_debut ?? "?"} → {r.periode_fin ?? "?"} ({r.nb_lignes} lignes)
                </option>
              ))}
            </select>
          </div>

          {selectedId && (
            <>
              <button onClick={lancerAuto} disabled={running}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                <RefreshCw size={14} className={running ? "animate-spin" : ""} />
                {running ? "Traitement…" : "Réconciliation automatique"}
              </button>
              <button onClick={telechargerPdf}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Download size={14} /> Rapport PDF
              </button>
            </>
          )}

          <button onClick={chargerReleves}
            className="flex items-center gap-1 px-2 py-2 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Résultat auto */}
      {autoResult && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { val: autoResult.nb_reconciliees,     label: "Réconciliées auto",   color: "bg-green-600",  icon: "✅" },
            { val: autoResult.nb_a_justifier,      label: "À vérifier",          color: "bg-amber-500",  icon: "⚠️" },
            { val: autoResult.nb_non_reconciliees, label: "Sans correspondance", color: "bg-red-600",    icon: "❓" },
          ].map(({ val, label, color, icon }) => (
            <div key={label} className={`${color} rounded-xl p-4 text-white text-center`}>
              <p className="text-3xl font-bold">{icon} {val}</p>
              <p className="text-xs opacity-80 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Liste des relevés si rien sélectionné */}
      {!selectedId && releves && (
        releves.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl">
            <GitMerge size={48} className="mx-auto mb-3 opacity-30" />
            <p>Aucun relevé importé. Commencez par importer un relevé dans l'onglet "Importer".</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b">
              <p className="text-sm font-semibold text-gray-700">Relevés importés ({releves.length})</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-t">
                  <th className="text-left px-5 py-2 font-medium">Banque / Compte</th>
                  <th className="text-left px-4 py-2 font-medium">Période</th>
                  <th className="text-center px-4 py-2 font-medium">Lignes</th>
                  <th className="text-center px-4 py-2 font-medium">Réconciliées</th>
                  <th className="text-center px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {releves.map((r, i) => (
                  <tr key={r.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {r.banque}
                      {r.numero_compte && <p className="text-xs text-gray-400 font-normal">N°{r.numero_compte}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.periode_debut ?? "?"} → {r.periode_fin ?? "?"}
                    </td>
                    <td className="px-4 py-3 text-center">{r.nb_lignes}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-600 font-medium">{r.nb_reconciliees}</span>
                      <span className="text-gray-300"> / </span>{r.nb_lignes}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatutReleveBadge statut={r.statut} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedId(r.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Eye size={12} /> Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Tableau lignes du relevé sélectionné */}
      {selectedId && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {loadingDetail ? "Chargement…" : `Lignes du relevé (${lignesFiltrees.length})`}
            </p>
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none">
              <option value="">Toutes</option>
              <option value="reconciliee">Réconciliées</option>
              <option value="a_justifier">À vérifier</option>
              <option value="non_reconciliee">Non réconciliées</option>
              <option value="ignoree">Ignorées</option>
            </select>
          </div>

          {loadingDetail ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : lignesFiltrees.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">Aucune ligne.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Libellé banque</th>
                    <th className="text-center px-4 py-2 font-medium">Type</th>
                    <th className="text-right px-4 py-2 font-medium">Montant</th>
                    <th className="text-center px-4 py-2 font-medium">Statut</th>
                    <th className="text-left px-4 py-2 font-medium">Écriture liée</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lignesFiltrees.map((l, i) => (
                    <tr key={l.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{l.date_operation}</td>
                      <td className="px-4 py-2.5 text-gray-800 max-w-64">
                        <p className="truncate">{l.libelle_banque}</p>
                        {l.reference_banque && <p className="text-xs text-gray-400 truncate">{l.reference_banque}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-medium ${l.type === "debit" ? "text-red-600" : "text-green-600"}`}>
                          {l.type === "debit" ? "▼ Débit" : "▲ Crédit"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                        {FCFA(l.montant_fcfa)}
                        {parseFloat(l.ecart_fcfa) > 0 && (
                          <p className="text-xs text-amber-600">écart {FCFA(l.ecart_fcfa)}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatutLigneBadge statut={l.statut_reconciliation} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-48">
                        {l.ecriture_libelle ? (
                          <>
                            <p className="truncate">{l.ecriture_libelle}</p>
                            <p className="text-gray-400">{l.ecriture_date}</p>
                          </>
                        ) : l.motif_ignore ? (
                          <span className="italic">{l.motif_ignore}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {l.statut_reconciliation !== "reconciliee" && l.statut_reconciliation !== "ignoree" && (
                          <div className="flex gap-2">
                            <button onClick={() => setModalReconc(l)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap flex items-center gap-0.5">
                              <CheckCircle2 size={11} /> Lier
                            </button>
                            <button onClick={() => setModalIgnorer(l)}
                              className="text-xs text-gray-400 hover:text-gray-600 font-medium whitespace-nowrap">
                              Ignorer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalReconc && (
        <ModalReconcilier ligne={modalReconc} onClose={() => setModalReconc(null)}
          onDone={() => { setModalReconc(null); if (selectedId) chargerDetail(selectedId); }} />
      )}
      {modalIgnorer && (
        <ModalIgnorer ligne={modalIgnorer} onClose={() => setModalIgnorer(null)}
          onDone={() => { setModalIgnorer(null); if (selectedId) chargerDetail(selectedId); }} />
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const [tab, setTab] = useState<"import" | "reconcilier">("import");

  const TABS = [
    { id: "import"      as const, label: "Importer un relevé" },
    { id: "reconcilier" as const, label: "Réconcilier" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
          <GitMerge size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Réconciliation bancaire</h1>
          <p className="text-sm text-gray-400">Rapprochement relevés bancaires / écritures comptables</p>
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

      {tab === "import"      && <ImportReleve />}
      {tab === "reconcilier" && <Reconciliation />}
    </div>
  );
}
