import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, Package, TrendingDown, TrendingUp, AlertTriangle,
  Plus, CheckCircle2, Clock, Truck, ArrowRight, History, RefreshCw,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { ...hdr(), ...(init?.headers ?? {}) } });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `Erreur ${res.status}`); }
  return res.json();
}

function kg(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  return n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${n.toFixed(0)} kg`;
}
function pct(stock: string | number | null, capacite: string | number | null) {
  const s = parseFloat(String(stock ?? 0));
  const c = parseFloat(String(capacite ?? 0));
  if (!c) return 0;
  return Math.round((s / c) * 100);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Entrepot {
  id: number; nom: string; zoneNom: string | null; zoneType: string | null;
  capaciteMaxKg: string | null; seuilAlerteKg: string | null;
  stockActuelKg: string; stockMisAJourLe: string | null; actif: boolean;
}
interface Mouvement {
  id: number; typeMouvement: "entree" | "sortie"; motif: string;
  poidsKg: string; stockAvantKg: string | null; stockApresKg: string | null;
  dateMouvement: string; notes: string | null; enregistreParNom: string | null;
  livraisonId: number | null; transfertId: number | null;
}
interface Transfert {
  id: number; numeroTransfert: string; statut: string;
  poidsDepart_kg: string | null; poidsArrivee_kg: string | null; ecartKg: string | null;
  dateDepart: string | null; dateArrivee: string | null; datePrevue: string | null;
  typeVehicule: string | null; immatriculation: string | null;
  nomChauffeur: string | null; notes: string | null; createdAt: string;
}

const MOTIF_LABEL: Record<string, string> = {
  livraison_membre: "Livraison membre",
  transfert_central: "Transfert central",
  ajustement: "Ajustement",
  perte: "Perte",
};
const STATUT_COLORS: Record<string, string> = {
  planifie: "bg-blue-100 text-blue-800",
  en_cours: "bg-amber-100 text-amber-800",
  arrive: "bg-purple-100 text-purple-800",
  confirme: "bg-green-100 text-green-800",
  litige: "bg-red-100 text-red-800",
};
const STATUT_LABEL: Record<string, string> = {
  planifie: "Planifié", en_cours: "En transit", arrive: "Arrivé", confirme: "Confirmé", litige: "Litige",
};

export default function MonEntrepotPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [onglet, setOnglet] = useState<"stock" | "mouvements" | "transferts">("stock");
  const [showTransfert, setShowTransfert] = useState(false);
  const [showDepart, setShowDepart] = useState<Transfert | null>(null);
  const [form, setForm] = useState({
    poidsKg: "", typeVehicule: "propre", immatriculation: "",
    nomChauffeur: "", telephoneChauffeur: "", datePrevue: "", notes: "",
  });
  const [formDepart, setFormDepart] = useState({ poidsDepart_kg: "", immatriculation: "", nomChauffeur: "" });

  const { data: entrepot, isLoading, error } = useQuery<Entrepot>({
    queryKey: ["mon-entrepot"],
    queryFn: () => apiFetch("/terrain/entrepot"),
    retry: 1,
  });

  const { data: mouvements = [] } = useQuery<Mouvement[]>({
    queryKey: ["mes-mouvements"],
    queryFn: () => apiFetch("/terrain/entrepot/mouvements?limit=50"),
    enabled: onglet === "mouvements" && !!entrepot,
  });

  const { data: transferts = [] } = useQuery<Transfert[]>({
    queryKey: ["mes-transferts"],
    queryFn: () => apiFetch("/terrain/entrepot/transferts"),
    enabled: onglet === "transferts" || onglet === "stock",
  });

  const mutTransfert = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/terrain/entrepot/transferts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mes-transferts"] });
      qc.invalidateQueries({ queryKey: ["mon-entrepot"] });
      setShowTransfert(false);
      setForm({ poidsKg: "", typeVehicule: "propre", immatriculation: "", nomChauffeur: "", telephoneChauffeur: "", datePrevue: "", notes: "" });
      toast({ title: "Transfert soumis avec succès", description: "La direction a été notifiée." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutDepart = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/terrain/entrepot/transferts/${id}/depart`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mes-transferts"] });
      qc.invalidateQueries({ queryKey: ["mon-entrepot"] });
      setShowDepart(null);
      toast({ title: "Départ confirmé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-48" />
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !entrepot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
        <Warehouse className="w-14 h-14 mb-4 opacity-30" />
        <p className="font-semibold text-gray-600">Aucun entrepôt associé</p>
        <p className="text-sm mt-1">Demandez à votre directeur de créer votre entrepôt.</p>
      </div>
    );
  }

  const p = pct(entrepot.stockActuelKg, entrepot.capaciteMaxKg);
  const alerte = entrepot.seuilAlerteKg && parseFloat(entrepot.stockActuelKg) > parseFloat(entrepot.seuilAlerteKg);
  const jaugeColor = alerte ? "bg-orange-500" : p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-400" : "bg-green-500";

  const entreesSemaine = mouvements.filter(m => m.typeMouvement === "entree" &&
    new Date(m.dateMouvement) > new Date(Date.now() - 7 * 86400000));
  const sortiesSemaine = mouvements.filter(m => m.typeMouvement === "sortie" &&
    new Date(m.dateMouvement) > new Date(Date.now() - 7 * 86400000));
  const totalEntrees = entreesSemaine.reduce((a, m) => a + parseFloat(m.poidsKg), 0);
  const totalSorties = sortiesSemaine.reduce((a, m) => a + parseFloat(m.poidsKg), 0);

  const transfertPlanifie = transferts.find(t => t.statut === "planifie");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Warehouse className="w-5 h-5 text-green-700" /> Mon entrepôt
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{entrepot.nom}{entrepot.zoneNom ? ` — ${entrepot.zoneNom}` : ""}</p>
      </div>

      {/* Carte stock principal */}
      <div className={`bg-white rounded-2xl border p-5 shadow-sm ${alerte ? "border-orange-300" : "border-gray-100"}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Stock actuel</p>
            <p className="text-3xl font-bold text-gray-900 mt-0.5">{kg(entrepot.stockActuelKg)}</p>
            {entrepot.capaciteMaxKg && (
              <p className="text-sm text-gray-500 mt-0.5">sur {kg(entrepot.capaciteMaxKg)} de capacité</p>
            )}
          </div>
          {entrepot.capaciteMaxKg && (
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: alerte ? "#f97316" : p > 80 ? "#ef4444" : "#16a34a" }}>
                {p}%
              </p>
            </div>
          )}
        </div>

        {entrepot.capaciteMaxKg && (
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all ${jaugeColor}`} style={{ width: `${Math.min(p, 100)}%` }} />
          </div>
        )}

        {alerte && (
          <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-800">Seuil d'alerte atteint</p>
              <p className="text-xs text-orange-600">Planifiez un transfert vers le magasin central.</p>
            </div>
          </div>
        )}

        {entrepot.stockMisAJourLe && (
          <p className="text-xs text-gray-400">Mis à jour le {fmtDate(entrepot.stockMisAJourLe)}</p>
        )}
      </div>

      {/* KPIs semaine */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs text-green-700 font-medium">Entrées cette semaine</p>
          </div>
          <p className="text-xl font-bold text-green-800">+{kg(totalEntrees)}</p>
          <p className="text-xs text-green-600">{entreesSemaine.length} livraison{entreesSemaine.length > 1 ? "s" : ""}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-blue-700 font-medium">Sorties cette semaine</p>
          </div>
          <p className="text-xl font-bold text-blue-800">-{kg(totalSorties)}</p>
          <p className="text-xs text-blue-600">{sortiesSemaine.length} transfert{sortiesSemaine.length > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Transfert planifié en attente */}
      {transfertPlanifie && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Transfert planifié
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                {transfertPlanifie.numeroTransfert} — {kg(transfertPlanifie.poidsDepart_kg)} prévu
              </p>
              {transfertPlanifie.datePrevue && (
                <p className="text-xs text-blue-500 mt-0.5">Date prévue : {fmtDate(transfertPlanifie.datePrevue)}</p>
              )}
            </div>
            <button
              onClick={() => {
                setShowDepart(transfertPlanifie);
                setFormDepart({ poidsDepart_kg: transfertPlanifie.poidsDepart_kg ?? "", immatriculation: transfertPlanifie.immatriculation ?? "", nomChauffeur: transfertPlanifie.nomChauffeur ?? "" });
              }}
              className="flex items-center gap-1 bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-800">
              <Truck className="w-3 h-3" /> Confirmer départ
            </button>
          </div>
        </div>
      )}

      {/* Bouton nouveau transfert */}
      <button
        onClick={() => setShowTransfert(true)}
        className="w-full flex items-center justify-center gap-2 bg-green-700 text-white py-3 rounded-xl font-medium hover:bg-green-800 transition-colors">
        <Plus className="w-5 h-5" /> Nouveau transfert vers le central
      </button>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: "stock", label: "Aperçu" },
          { key: "mouvements", label: "Mouvements" },
          { key: "transferts", label: "Mes transferts" },
        ].map(o => (
          <button key={o.key} onClick={() => setOnglet(o.key as typeof onglet)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${onglet === o.key ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Contenu onglets */}
      {onglet === "stock" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Derniers mouvements</h3>
          {transferts.slice(0, 3).map(t => (
            <div key={t.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{t.numeroTransfert}</p>
                <p className="text-xs text-gray-500">{fmtDate(t.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-700">{kg(t.poidsDepart_kg)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[t.statut] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUT_LABEL[t.statut] ?? t.statut}
                </span>
              </div>
            </div>
          ))}
          {transferts.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">Aucun transfert pour l'instant</p>
          )}
        </div>
      )}

      {onglet === "mouvements" && (
        <div className="space-y-2">
          {mouvements.length === 0
            ? <p className="text-center text-sm text-gray-400 py-8">Aucun mouvement enregistré</p>
            : mouvements.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.typeMouvement === "entree" ? "bg-green-100" : "bg-blue-100"}`}>
                    {m.typeMouvement === "entree"
                      ? <TrendingUp className="w-4 h-4 text-green-600" />
                      : <TrendingDown className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{MOTIF_LABEL[m.motif] ?? m.motif}</p>
                    <p className="text-xs text-gray-400">{fmtDate(m.dateMouvement)}</p>
                    {m.notes && <p className="text-xs text-gray-500">{m.notes}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${m.typeMouvement === "entree" ? "text-green-600" : "text-blue-600"}`}>
                    {m.typeMouvement === "entree" ? "+" : "-"}{kg(m.poidsKg)}
                  </p>
                  {m.stockApresKg && <p className="text-xs text-gray-400">Solde : {kg(m.stockApresKg)}</p>}
                </div>
              </div>
            ))}
        </div>
      )}

      {onglet === "transferts" && (
        <div className="space-y-2">
          {transferts.length === 0
            ? <p className="text-center text-sm text-gray-400 py-8">Aucun transfert</p>
            : transferts.map((t) => (
              <div key={t.id} className={`bg-white rounded-xl border p-4 ${t.statut === "litige" ? "border-red-200" : "border-gray-100"}`}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-mono font-semibold text-sm text-gray-800">{t.numeroTransfert}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[t.statut] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUT_LABEL[t.statut] ?? t.statut}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  {t.poidsDepart_kg && <span>Départ : <strong>{kg(t.poidsDepart_kg)}</strong></span>}
                  {t.poidsArrivee_kg && <span>Arrivée : <strong>{kg(t.poidsArrivee_kg)}</strong></span>}
                  {t.nomChauffeur && <span>Chauffeur : {t.nomChauffeur}</span>}
                  {t.immatriculation && <span>Immat. : {t.immatriculation}</span>}
                </div>
                {t.ecartKg && parseFloat(t.ecartKg) !== 0 && (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Écart : {kg(Math.abs(parseFloat(t.ecartKg)))} ({t.motifEcart ?? "motif non précisé"})
                  </p>
                )}
                {t.statut === "planifie" && (
                  <button
                    onClick={() => {
                      setShowDepart(t);
                      setFormDepart({ poidsDepart_kg: t.poidsDepart_kg ?? "", immatriculation: t.immatriculation ?? "", nomChauffeur: t.nomChauffeur ?? "" });
                    }}
                    className="mt-2 flex items-center gap-1 text-xs text-blue-700 font-medium hover:underline">
                    <Truck className="w-3 h-3" /> Confirmer le départ
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Modal nouveau transfert */}
      {showTransfert && entrepot && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Nouveau transfert vers le central</h2>
            <p className="text-sm text-gray-500 mb-4">
              Stock disponible : <strong className="text-gray-800">{kg(entrepot.stockActuelKg)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Poids à transférer (kg) *</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={form.poidsKg}
                  onChange={(e) => setForm(f => ({ ...f, poidsKg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de transport</label>
                <div className="flex gap-3">
                  {["propre", "location"].map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="typeVehicule" value={v} checked={form.typeVehicule === v}
                        onChange={(e) => setForm(f => ({ ...f, typeVehicule: e.target.value }))} />
                      <span className="text-sm text-gray-700">{v === "propre" ? "Camion propre" : "Location"}</span>
                    </label>
                  ))}
                </div>
              </div>
              {[
                { key: "immatriculation", label: "Immatriculation *", placeholder: "ex: CI 1234 AB" },
                { key: "nomChauffeur", label: "Chauffeur *", placeholder: "Nom du chauffeur" },
                { key: "telephoneChauffeur", label: "Téléphone chauffeur", placeholder: "07 XX XX XX XX" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date prévue</label>
                <input type="datetime-local"
                  value={form.datePrevue}
                  onChange={(e) => setForm(f => ({ ...f, datePrevue: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} placeholder="Observations…"
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowTransfert(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!form.poidsKg || !form.immatriculation || !form.nomChauffeur || mutTransfert.isPending}
                onClick={() => mutTransfert.mutate({
                  entrepotId: entrepot.id,
                  poidsKg: parseFloat(form.poidsKg),
                  typeVehicule: form.typeVehicule,
                  immatriculation: form.immatriculation || undefined,
                  nomChauffeur: form.nomChauffeur || undefined,
                  telephoneChauffeur: form.telephoneChauffeur || undefined,
                  datePrevue: form.datePrevue || undefined,
                  notes: form.notes || undefined,
                })}
                className="flex-1 bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutTransfert.isPending ? "Envoi…" : "Soumettre le transfert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmer départ */}
      {showDepart && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmer le départ</h2>
            <p className="text-sm text-gray-500 mb-4">
              Transfert <span className="font-mono font-semibold">{showDepart.numeroTransfert}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Poids pesé au départ (kg) *</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={formDepart.poidsDepart_kg}
                  onChange={(e) => setFormDepart(f => ({ ...f, poidsDepart_kg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                <input type="text" value={formDepart.immatriculation}
                  onChange={(e) => setFormDepart(f => ({ ...f, immatriculation: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chauffeur</label>
                <input type="text" value={formDepart.nomChauffeur}
                  onChange={(e) => setFormDepart(f => ({ ...f, nomChauffeur: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowDepart(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formDepart.poidsDepart_kg || mutDepart.isPending}
                onClick={() => mutDepart.mutate({
                  id: showDepart.id,
                  body: {
                    poidsDepart_kg: parseFloat(formDepart.poidsDepart_kg),
                    immatriculation: formDepart.immatriculation || undefined,
                    nomChauffeur: formDepart.nomChauffeur || undefined,
                  },
                })}
                className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
                {mutDepart.isPending ? "En cours…" : "Confirmer le départ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
