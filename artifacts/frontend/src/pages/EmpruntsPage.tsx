import { useState, useMemo } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  useGetEmprunts,
  useGetEmpruntsDashboard,
  useGetEmpruntsAlertes,
  useGetEmpruntsPreteurs,
  useGetEmpruntsIdEcheancier,
  getGetEmpruntsIdEcheancierQueryKey,
  usePostEmprunts,
  usePostEmpruntsPreteurs,
  usePostEmpruntsIdRembourser,
  usePostEmpruntsPreviewEcheancier,
} from "@workspace/api-client-react";
import type {
  EmpruntDetail,
  LigneEcheancier,
  EcheanceAlerte,
} from "@workspace/api-client-react";

const PERIODICITES = [
  { value: "mensuel",     label: "Mensuel" },
  { value: "trimestriel", label: "Trimestriel" },
  { value: "semestriel",  label: "Semestriel" },
  { value: "annuel",      label: "Annuel" },
  { value: "in_fine",     label: "In fine" },
];

const PRETEUR_TYPES = [
  { value: "banque",       label: "Banque" },
  { value: "microfinance", label: "Microfinance" },
  { value: "bailleur",     label: "Bailleur" },
  { value: "prive",        label: "Privé" },
];

const MODES_PAIEMENT = ["Virement", "Chèque", "Espèces", "Mobile Money"];

function statutBadge(statut: string) {
  const cfg: Record<string, string> = {
    en_cours:    "bg-blue-100 text-blue-800",
    rembourse:   "bg-green-100 text-green-800",
    en_retard:   "bg-red-100 text-red-800",
    restructure: "bg-yellow-100 text-yellow-800",
  };
  const labels: Record<string, string> = {
    en_cours: "En cours", rembourse: "Remboursé",
    en_retard: "En retard", restructure: "Restructuré",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg[statut] ?? "bg-gray-100 text-gray-700"}`}>
      {labels[statut] ?? statut}
    </span>
  );
}

function echeanceBadge(statut: string) {
  const cfg: Record<string, string> = {
    a_payer:  "bg-amber-100 text-amber-800",
    paye:     "bg-green-100 text-green-800",
    en_retard:"bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    a_payer: "À payer", paye: "Payé", en_retard: "En retard",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg[statut] ?? "bg-gray-100 text-gray-700"}`}>
      {labels[statut] ?? statut}
    </span>
  );
}

function fmt(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  return isNaN(v) ? "0" : v.toLocaleString("fr-FR") + " FCFA";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

function jours(d: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const ech = new Date(d);
  return Math.ceil((ech.getTime() - today.getTime()) / 86400000);
}

// ─── Modal Nouvel Emprunt ─────────────────────────────────────────────────────

function ModalNouvelEmprunt({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: preteurs = [] } = useGetEmpruntsPreteurs();
  const createEmprunt = usePostEmprunts();
  const previewMut = usePostEmpruntsPreviewEcheancier();

  const [form, setForm] = useState({
    preteurId: "",
    libelle: "",
    montantFcfa: "",
    tauxInteretAnnuelPct: "",
    dureeMois: "",
    dateDebut: new Date().toISOString().slice(0, 10),
    periodicite: "mensuel",
    objet: "",
    garantie: "",
  });
  const [preview, setPreview] = useState<LigneEcheancier[] | null>(null);
  const [showPreteurForm, setShowPreteurForm] = useState(false);
  const [newPreteur, setNewPreteur] = useState({ type: "banque", nom: "", contact: "", ville: "" });
  const createPreteur = usePostEmpruntsPreteurs();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handlePreview = () => {
    if (!form.montantFcfa || !form.tauxInteretAnnuelPct || !form.dureeMois || !form.dateDebut) return;
    previewMut.mutate({
      data: {
        preteurId: Number(form.preteurId),
        libelle: form.libelle,
        montantFcfa: Number(form.montantFcfa),
        tauxInteretAnnuelPct: Number(form.tauxInteretAnnuelPct),
        dureeMois: Number(form.dureeMois),
        dateDebut: form.dateDebut,
        periodicite: form.periodicite as "mensuel",
      }
    }, { onSuccess: (data) => setPreview(data as unknown as LigneEcheancier[]) });
  };

  const handleSubmit = () => {
    if (!form.preteurId || !form.libelle || !form.montantFcfa) return;
    createEmprunt.mutate({
      data: {
        preteurId: Number(form.preteurId),
        libelle: form.libelle,
        montantFcfa: Number(form.montantFcfa),
        tauxInteretAnnuelPct: Number(form.tauxInteretAnnuelPct),
        dureeMois: Number(form.dureeMois),
        dateDebut: form.dateDebut,
        periodicite: form.periodicite as "mensuel",
        objet: form.objet || undefined,
        garantie: form.garantie || undefined,
      }
    }, { onSuccess: () => { onCreated(); onClose(); } });
  };

  const handleSavePreteur = () => {
    if (!newPreteur.nom) return;
    createPreteur.mutate({
      data: { type: newPreteur.type as "banque", nom: newPreteur.nom, contact: newPreteur.contact || undefined, ville: newPreteur.ville || undefined }
    }, { onSuccess: () => setShowPreteurForm(false) });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-8">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Nouvel emprunt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Prêteur */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Prêteur *</label>
              <button onClick={() => setShowPreteurForm(v => !v)} className="text-xs text-green-700 hover:underline">
                + Nouveau prêteur
              </button>
            </div>
            {showPreteurForm && (
              <div className="mb-3 p-3 bg-gray-50 rounded-xl border space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={newPreteur.type} onChange={e => setNewPreteur(p => ({ ...p, type: e.target.value }))}
                    className="border rounded-lg px-3 py-1.5 text-sm">
                    {PRETEUR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input placeholder="Nom *" value={newPreteur.nom} onChange={e => setNewPreteur(p => ({ ...p, nom: e.target.value }))}
                    className="border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Contact" value={newPreteur.contact} onChange={e => setNewPreteur(p => ({ ...p, contact: e.target.value }))}
                    className="border rounded-lg px-3 py-1.5 text-sm" />
                  <input placeholder="Ville" value={newPreteur.ville} onChange={e => setNewPreteur(p => ({ ...p, ville: e.target.value }))}
                    className="border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <button onClick={handleSavePreteur} className="text-sm bg-green-700 text-white px-3 py-1 rounded-lg">
                  Enregistrer le prêteur
                </button>
              </div>
            )}
            <select value={form.preteurId} onChange={e => set("preteurId", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Choisir un prêteur…</option>
              {preteurs.map((p: { id: number; nom: string; type: string }) => (
                <option key={p.id} value={p.id}>{p.nom} ({p.type})</option>
              ))}
            </select>
          </div>

          {/* Libellé */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Libellé *</label>
            <input value={form.libelle} onChange={e => set("libelle", e.target.value)}
              placeholder="Ex: Financement campagne 2026"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Montant + Taux */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant (FCFA) *</label>
              <MoneyInput value={form.montantFcfa} onChange={(raw) => set("montantFcfa", raw)}
                placeholder="5 000 000" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taux annuel (%) *</label>
              <input type="number" step="0.01" value={form.tauxInteretAnnuelPct} onChange={e => set("tauxInteretAnnuelPct", e.target.value)}
                placeholder="12" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Durée + Périodicité */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (mois) *</label>
              <input type="number" value={form.dureeMois} onChange={e => set("dureeMois", e.target.value)}
                placeholder="12" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Périodicité *</label>
              <select value={form.periodicite} onChange={e => set("periodicite", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {PERIODICITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Date début */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
            <input type="date" value={form.dateDebut} onChange={e => set("dateDebut", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Objet + Garantie */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Objet</label>
              <input value={form.objet} onChange={e => set("objet", e.target.value)}
                placeholder="Financement achat cacao…" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Garantie</label>
              <input value={form.garantie} onChange={e => set("garantie", e.target.value)}
                placeholder="Entrepôt de stockage…" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Aperçu échéancier */}
          <div>
            <button onClick={handlePreview}
              className="text-sm text-green-700 border border-green-300 rounded-lg px-4 py-1.5 hover:bg-green-50">
              Aperçu de l'échéancier
            </button>
          </div>

          {preview && preview.length > 0 && (
            <div className="overflow-auto max-h-48 border rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">N°</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Capital</th>
                    <th className="px-3 py-2 text-right">Intérêt</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((l) => (
                    <tr key={l.numeroEcheance} className="border-t">
                      <td className="px-3 py-1.5">{l.numeroEcheance}</td>
                      <td className="px-3 py-1.5">{fmtDate(l.dateEcheance)}</td>
                      <td className="px-3 py-1.5 text-right">{Number(l.capitalFcfa).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-1.5 text-right">{Number(l.interetFcfa).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{Number(l.totalEcheanceFcfa).toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={handleSubmit} disabled={createEmprunt.isPending}
            className="px-5 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {createEmprunt.isPending ? "Enregistrement…" : "Créer l'emprunt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Remboursement ──────────────────────────────────────────────────────

function ModalRemboursement({ empruntId, echeance, onClose, onDone }: {
  empruntId: number;
  echeance: LigneEcheancier;
  onClose: () => void;
  onDone: () => void;
}) {
  const rembourser = usePostEmpruntsIdRembourser();
  const [form, setForm] = useState({
    dateRemboursement: new Date().toISOString().slice(0, 10),
    montantCapitalFcfa: echeance.capitalFcfa,
    montantInteretFcfa: echeance.interetFcfa,
    modePaiement: "Virement",
    reference: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    rembourser.mutate({
      id: empruntId,
      data: {
        echeanceId: echeance.id,
        dateRemboursement: form.dateRemboursement,
        montantCapitalFcfa: Number(form.montantCapitalFcfa),
        montantInteretFcfa: Number(form.montantInteretFcfa),
        modePaiement: form.modePaiement,
        reference: form.reference || undefined,
      }
    }, { onSuccess: () => { onDone(); onClose(); } });
  };

  const total = Number(form.montantCapitalFcfa) + Number(form.montantInteretFcfa);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Enregistrer un paiement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            Échéance n°{echeance.numeroEcheance} — {fmtDate(echeance.dateEcheance)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capital (FCFA)</label>
              <MoneyInput value={form.montantCapitalFcfa} onChange={(raw) => set("montantCapitalFcfa", raw)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Intérêts (FCFA)</label>
              <MoneyInput value={form.montantInteretFcfa} onChange={(raw) => set("montantInteretFcfa", raw)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm text-green-800 font-medium">Total à payer</span>
            <span className="text-base font-bold text-green-900">{total.toLocaleString("fr-FR")} FCFA</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement</label>
            <input type="date" value={form.dateRemboursement} onChange={e => set("dateRemboursement", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
              <select value={form.modePaiement} onChange={e => set("modePaiement", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Référence</label>
              <input value={form.reference} onChange={e => set("reference", e.target.value)}
                placeholder="N° virement…" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={handleSubmit} disabled={rembourser.isPending}
            className="px-5 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {rembourser.isPending ? "Enregistrement…" : "Valider le paiement"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 1 — Emprunts en cours ────────────────────────────────────────────

function OngletEmprunts({ onRefresh }: { onRefresh: () => void }) {
  const { data: dashboard } = useGetEmpruntsDashboard();
  const { data: emprunts = [], refetch } = useGetEmprunts();
  const [showModal, setShowModal] = useState(false);

  const kpis = [
    { label: "Total emprunté",  value: fmt(dashboard?.totalEmprunte), color: "text-blue-700" },
    { label: "Total remboursé", value: fmt(dashboard?.totalRembourse), color: "text-green-700" },
    { label: "Solde restant",   value: fmt(dashboard?.soldeTotal),     color: "text-red-700" },
    { label: "Emprunts actifs", value: String(dashboard?.nbEmpruntsActifs ?? 0), color: "text-gray-800" },
  ];

  const prochaine = dashboard?.prochaineEcheance;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Prochaine échéance */}
      {prochaine && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="text-3xl">📅</div>
          <div>
            <p className="text-sm font-medium text-amber-900">Prochaine échéance</p>
            <p className="text-xs text-amber-700">
              {prochaine.libelle} — {prochaine.preteurNom ?? "Prêteur inconnu"} · {fmtDate(prochaine.dateEcheance)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-base font-bold text-amber-900">{fmt(prochaine.totalEcheance)}</p>
            <p className="text-xs text-amber-600">dans {jours(prochaine.dateEcheance ?? "")} jours</p>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Emprunts</h3>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-green-700 text-white text-sm px-4 py-2 rounded-xl hover:bg-green-800">
            <span>+</span> Nouvel emprunt
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Prêteur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Libellé</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Montant</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Taux</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Solde restant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Échéance finale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(emprunts as EmpruntDetail[]).map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.preteurNom ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{e.libelle}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{fmt(e.montantFcfa)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{Number(e.tauxInteretAnnuelPct).toFixed(2)} %</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(e.soldeRestant)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(e.dateEcheance)}</td>
                  <td className="px-4 py-3">{statutBadge(e.statut)}</td>
                </tr>
              ))}
              {emprunts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun emprunt enregistré</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ModalNouvelEmprunt
          onClose={() => setShowModal(false)}
          onCreated={() => { refetch(); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Onglet 2 — Échéancier & Remboursements ───────────────────────────────────

function OngletEcheancier() {
  const { data: emprunts = [] } = useGetEmprunts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalEch, setModalEch] = useState<LigneEcheancier | null>(null);

  const { data: lignes = [], refetch } = useGetEmpruntsIdEcheancier(
    selectedId ?? 0,
    { query: { enabled: !!selectedId, queryKey: getGetEmpruntsIdEcheancierQueryKey(selectedId ?? 0) } }
  );

  const selected = (emprunts as EmpruntDetail[]).find(e => e.id === selectedId);

  return (
    <div className="space-y-5">
      {/* Sélecteur */}
      <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Emprunt :</label>
        <select value={selectedId ?? ""} onChange={e => setSelectedId(Number(e.target.value) || null)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm">
          <option value="">— Sélectionner un emprunt —</option>
          {(emprunts as EmpruntDetail[]).map(e => (
            <option key={e.id} value={e.id}>
              {e.preteurNom} — {e.libelle} ({fmt(e.soldeRestant)} restant)
            </option>
          ))}
        </select>
      </div>

      {/* Résumé emprunt */}
      {selected && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-3">
            <p className="text-xs text-gray-500">Montant initial</p>
            <p className="font-bold text-gray-900 mt-0.5">{fmt(selected.montantFcfa)}</p>
          </div>
          <div className="bg-white border rounded-xl p-3">
            <p className="text-xs text-gray-500">Remboursé</p>
            <p className="font-bold text-green-700 mt-0.5">{fmt(selected.montantRembourse)}</p>
          </div>
          <div className="bg-white border rounded-xl p-3">
            <p className="text-xs text-gray-500">Solde restant</p>
            <p className="font-bold text-red-700 mt-0.5">{fmt(selected.soldeRestant)}</p>
          </div>
        </div>
      )}

      {/* Tableau d'amortissement */}
      {selectedId && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-5 py-3 border-b">
            <h3 className="font-semibold text-gray-800">Tableau d'amortissement</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">N°</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Capital</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Intérêt</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Paiement</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(lignes as LigneEcheancier[]).map(l => {
                  const rowCls = l.statut === "en_retard"
                    ? "bg-red-50"
                    : l.statut === "paye"
                    ? "bg-green-50"
                    : "";
                  return (
                    <tr key={l.id} className={rowCls}>
                      <td className="px-4 py-2.5 text-gray-600">{l.numeroEcheance}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{fmtDate(l.dateEcheance)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{Number(l.capitalFcfa).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{Number(l.interetFcfa).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{Number(l.totalEcheanceFcfa).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-2.5">{echeanceBadge(l.statut)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {l.datePaiement ? fmtDate(l.datePaiement) : "—"}
                        {l.referencePaiement && <span className="ml-1 text-gray-400">({l.referencePaiement})</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {l.statut !== "paye" && (
                          <button onClick={() => setModalEch(l)}
                            className="text-xs text-green-700 border border-green-300 rounded-lg px-2 py-1 hover:bg-green-50">
                            Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lignes.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400 text-sm">Sélectionner un emprunt</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalEch && selectedId && (
        <ModalRemboursement
          empruntId={selectedId}
          echeance={modalEch}
          onClose={() => setModalEch(null)}
          onDone={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── Onglet 3 — Alertes & Prévisions ─────────────────────────────────────────

function OngletAlertes() {
  const { data: alertes = [] } = useGetEmpruntsAlertes();

  const today = new Date().toISOString().slice(0, 10);

  const groups = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30);

    const urgent: EcheanceAlerte[] = [];
    const proche: EcheanceAlerte[] = [];
    const planifie: EcheanceAlerte[] = [];

    for (const a of alertes as EcheanceAlerte[]) {
      const d = new Date(a.dateEcheance);
      if (d <= in7)       urgent.push(a);
      else if (d <= in30) proche.push(a);
      else                planifie.push(a);
    }
    return { urgent, proche, planifie };
  }, [alertes]);

  const totalAlertes = Number((alertes as EcheanceAlerte[]).reduce((s, a) => s + Number(a.totalEcheanceFcfa), 0));

  function AlerteRow({ a }: { a: EcheanceAlerte }) {
    const j = jours(a.dateEcheance);
    return (
      <div className="flex items-center gap-4 py-3 px-4 border-b last:border-b-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          a.statut === "en_retard" ? "bg-red-500" :
          j <= 7 ? "bg-orange-500" : "bg-amber-400"
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{a.libelle ?? "Emprunt"}</p>
          <p className="text-xs text-gray-500">{a.preteurNom ?? "Prêteur"} · Échéance n°{a.numeroEcheance}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">{fmt(a.totalEcheanceFcfa)}</p>
          <p className="text-xs text-gray-500">{fmtDate(a.dateEcheance)} · {j < 0 ? `${Math.abs(j)}j de retard` : `dans ${j}j`}</p>
        </div>
        {echeanceBadge(a.statut)}
      </div>
    );
  }

  function Section({ title, items, color }: { title: string; items: EcheanceAlerte[]; color: string }) {
    if (items.length === 0) return null;
    return (
      <div className={`bg-white rounded-2xl border ${color} overflow-hidden`}>
        <div className="px-5 py-3 border-b bg-opacity-50">
          <h3 className="font-semibold text-gray-800">{title} <span className="text-gray-500 font-normal text-sm">({items.length})</span></h3>
        </div>
        {items.map(a => <AlerteRow key={a.echeanceId} a={a} />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Urgentes (≤ 7 jours)</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{groups.urgent.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs text-amber-700 font-medium">À venir (8–30 jours)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{groups.proche.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-700 font-medium">Total à décaisser</p>
          <p className="text-xl font-bold text-blue-800 mt-1">{fmt(totalAlertes)}</p>
        </div>
      </div>

      {/* Sections */}
      {(alertes as EcheanceAlerte[]).length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm">Aucune échéance dans les 30 prochains jours</p>
        </div>
      ) : (
        <>
          <Section title="⚠️ Urgentes" items={groups.urgent} color="border-red-200" />
          <Section title="📅 À venir" items={groups.proche} color="border-amber-200" />
          <Section title="🗓️ Planifiées" items={groups.planifie} color="border-gray-200" />
        </>
      )}

      {/* Note écritures OHADA */}
      <div className="bg-gray-50 border rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📒 Écritures OHADA</h3>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex gap-2">
            <span className="font-medium w-36">Réception emprunt :</span>
            <span>Débit 521 (Banque) / Crédit 164 (Emprunts)</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-36">Remb. capital :</span>
            <span>Débit 164 (Emprunts) / Crédit 521 (Banque)</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-36">Paiement intérêts :</span>
            <span>Débit 671 (Intérêts et charges) / Crédit 521 (Banque)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const ONGLETS = [
  { id: "emprunts",   label: "Emprunts en cours" },
  { id: "echeancier", label: "Échéancier & remboursements" },
  { id: "alertes",    label: "Alertes & prévisions" },
];

export default function EmpruntsPage() {
  const [onglet, setOnglet] = useState("emprunts");
  const { refetch: refetchDash } = useGetEmpruntsDashboard();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emprunts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des financements et remboursements</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-200 gap-1">
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              onglet === o.id
                ? "border-green-700 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {onglet === "emprunts"    && <OngletEmprunts onRefresh={refetchDash} />}
      {onglet === "echeancier"  && <OngletEcheancier />}
      {onglet === "alertes"     && <OngletAlertes />}
    </div>
  );
}
