import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, Package, TrendingDown, TrendingUp, AlertTriangle,
  Plus, CheckCircle2, XCircle, Clock, Truck, ArrowRight, BarChart3,
  RefreshCw, Eye,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

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
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

interface Entrepot {
  id: number; nom: string; zoneNom: string | null; zoneType: string | null;
  capaciteMaxKg: string | null; seuilAlerteKg: string | null;
  stockActuelKg: string; stockMisAJourLe: string | null;
  actif: boolean; delegueId: number;
  delegueNom: string | null; deleguePrenoms: string | null;
  adresse: string | null;
}
interface Stats {
  entrepots: Entrepot[];
  stockTotalEntrepotsKg: number;
  transfertsEnCours: number;
  alertesCapacite: number;
}
interface Transfert {
  id: number; numeroTransfert: string; statut: string;
  poidsDepart_kg: string | null; poidsArrivee_kg: string | null; ecartKg: string | null;
  motifEcart: string | null; dateDepart: string | null; dateArrivee: string | null;
  datePrevue: string | null; typeVehicule: string | null; immatriculation: string | null;
  nomChauffeur: string | null; entrepotNom: string | null; zoneNom: string | null;
  delegueNom: string | null; deleguePrenoms: string | null; notes: string | null;
}

const STATUT_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  planifie:  { label: "Planifié",   color: "bg-blue-100 text-blue-800",   icon: <Clock className="w-3 h-3" /> },
  en_cours:  { label: "En transit", color: "bg-amber-100 text-amber-800", icon: <Truck className="w-3 h-3" /> },
  arrive:    { label: "Arrivé",     color: "bg-purple-100 text-purple-800", icon: <Package className="w-3 h-3" /> },
  confirme:  { label: "Confirmé",   color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  litige:    { label: "Litige",     color: "bg-red-100 text-red-800",     icon: <AlertTriangle className="w-3 h-3" /> },
};

function StatutBadge({ statut }: { statut: string }) {
  const s = STATUT_LABEL[statut] ?? { label: statut, color: "bg-gray-100 text-gray-800", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function JaugeStock({ stock, capacite, seuil }: { stock: string; capacite: string | null; seuil: string | null }) {
  const p = pct(stock, capacite);
  const alerte = seuil && parseFloat(stock) > parseFloat(seuil);
  const color = alerte ? "bg-orange-500" : p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-400" : "bg-green-500";
  if (!capacite) return <span className="text-sm text-gray-500">{kg(stock)}</span>;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-semibold">{kg(stock)}</span>
        <span>{p}% de {kg(capacite)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      {alerte && (
        <p className="text-xs text-orange-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Seuil d'alerte atteint
        </p>
      )}
    </div>
  );
}

export default function EntrepotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const peutGerer = usePermission("entrepots", "creer");
  const [onglet, setOnglet] = useState<"stocks" | "transferts">("stocks");
  const [showArrivee, setShowArrivee] = useState<Transfert | null>(null);
  const [formArrivee, setFormArrivee] = useState({ poidsArrivee_kg: "", motifEcart: "", notes: "" });
  const [showCreer, setShowCreer] = useState(false);
  const [formCreer, setFormCreer] = useState({
    delegueId: "", nom: "", zoneNom: "", zoneType: "village",
    capaciteMaxKg: "", seuilAlerteKg: "", adresse: "",
  });

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["entrepots-stats"],
    queryFn: () => apiFetch("/entrepots/stats"),
    refetchInterval: 60_000,
  });

  const { data: transferts = [], isLoading: loadTrans } = useQuery<Transfert[]>({
    queryKey: ["transferts"],
    queryFn: () => apiFetch("/transferts"),
    enabled: onglet === "transferts",
  });

  const mutArrivee = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/transferts/${id}/arrivee`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferts"] });
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowArrivee(null);
      toast({ title: "Réception confirmée" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutLitige = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/transferts/${id}/litige`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferts"] });
      toast({ title: "Litige signalé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutCreer = useMutation({
    mutationFn: (body: object) => apiFetch("/entrepots", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowCreer(false);
      setFormCreer({ delegueId: "", nom: "", zoneNom: "", zoneType: "village", capaciteMaxKg: "", seuilAlerteKg: "", adresse: "" });
      toast({ title: "Entrepôt créé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const entrepots = stats?.entrepots ?? [];
  const enCours = transferts.filter((t) => ["planifie", "en_cours"].includes(t.statut));
  const historique = transferts.filter((t) => ["arrive", "confirme", "litige"].includes(t.statut));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-green-700" />
            Stocks
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Vue consolidée — entrepôts délégués &amp; transferts</p>
        </div>
        {peutGerer && (
          <button onClick={() => setShowCreer(true)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800">
            <Plus className="w-4 h-4" /> Nouvel entrepôt
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Stock total entrepôts", value: kg(stats?.stockTotalEntrepotsKg ?? 0), icon: <Package className="w-5 h-5 text-green-700" />, color: "green" },
          { label: "Entrepôts actifs", value: entrepots.filter(e => e.actif).length, icon: <Warehouse className="w-5 h-5 text-blue-600" />, color: "blue" },
          { label: "Transferts en cours", value: stats?.transfertsEnCours ?? 0, icon: <Truck className="w-5 h-5 text-amber-600" />, color: "amber" },
          { label: "Alertes capacité", value: stats?.alertesCapacite ?? 0, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: "red" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">{k.icon}<span className="text-xs text-gray-400">{k.label}</span></div>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: "stocks", label: "Entrepôts délégués" },
          { key: "transferts", label: `Transferts${stats?.transfertsEnCours ? ` (${stats.transfertsEnCours} en cours)` : ""}` },
        ].map((o) => (
          <button key={o.key} onClick={() => setOnglet(o.key as typeof onglet)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${onglet === o.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Contenu onglet Stocks */}
      {onglet === "stocks" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-40" />
            ))
            : entrepots.length === 0
              ? (
                <div className="col-span-full text-center py-16 text-gray-400">
                  <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun entrepôt délégué</p>
                  <p className="text-sm">Créez un entrepôt pour commencer le suivi des stocks.</p>
                </div>
              )
              : entrepots.map((e) => {
                const p = pct(e.stockActuelKg, e.capaciteMaxKg);
                const alerte = e.seuilAlerteKg && parseFloat(e.stockActuelKg) > parseFloat(e.seuilAlerteKg);
                return (
                  <div key={e.id} className={`bg-white rounded-xl border p-5 shadow-sm ${alerte ? "border-orange-300" : "border-gray-100"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{e.nom}</h3>
                        {e.zoneNom && <p className="text-xs text-gray-500">{e.zoneNom} · {e.zoneType ?? ""}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {e.actif ? "Actif" : "Inactif"}
                      </span>
                    </div>

                    <div className="mb-3">
                      <JaugeStock stock={e.stockActuelKg} capacite={e.capaciteMaxKg} seuil={e.seuilAlerteKg} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-50">
                      <span>
                        <span className="font-medium text-gray-700">
                          {e.delegueNom} {e.deleguePrenoms}
                        </span>
                      </span>
                      {e.stockMisAJourLe && <span>MàJ {fmtDate(e.stockMisAJourLe)}</span>}
                    </div>
                  </div>
                );
              })}
        </div>
      )}

      {/* Contenu onglet Transferts */}
      {onglet === "transferts" && (
        <div className="space-y-6">
          {/* En cours */}
          {enCours.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" /> Transferts en cours ({enCours.length})
              </h3>
              <div className="space-y-3">
                {enCours.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-sm text-gray-800">{t.numeroTransfert}</span>
                          <StatutBadge statut={t.statut} />
                        </div>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">{t.entrepotNom}</span>
                          {t.zoneNom && <span className="text-gray-400"> · {t.zoneNom}</span>}
                          <span className="text-gray-400"> — {t.delegueNom} {t.deleguePrenoms}</span>
                        </p>
                        {t.poidsDepart_kg && (
                          <p className="text-sm mt-1">
                            <span className="text-gray-500">Poids départ :</span>{" "}
                            <span className="font-semibold text-gray-800">{kg(t.poidsDepart_kg)}</span>
                          </p>
                        )}
                        {t.nomChauffeur && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {t.immatriculation} · {t.nomChauffeur}
                          </p>
                        )}
                      </div>
                      {t.statut === "en_cours" && (
                        <button
                          onClick={() => { setShowArrivee(t); setFormArrivee({ poidsArrivee_kg: "", motifEcart: "", notes: "" }); }}
                          className="flex items-center gap-1.5 bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-800 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmer arrivée
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historique */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Historique</h3>
            {loadTrans
              ? <div className="bg-white rounded-xl border h-32 animate-pulse" />
              : historique.length === 0 && enCours.length === 0
                ? (
                  <div className="text-center py-16 text-gray-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Aucun transfert pour l'instant</p>
                  </div>
                )
                : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">N°</th>
                          <th className="px-4 py-3 text-left">Entrepôt / Délégué</th>
                          <th className="px-4 py-3 text-right">Départ</th>
                          <th className="px-4 py-3 text-right">Arrivée</th>
                          <th className="px-4 py-3 text-right">Écart</th>
                          <th className="px-4 py-3 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {historique.map((t) => {
                          const ecart = t.ecartKg ? parseFloat(t.ecartKg) : null;
                          const dep = t.poidsDepart_kg ? parseFloat(t.poidsDepart_kg) : null;
                          const pctEc = dep && ecart ? Math.abs(ecart / dep * 100) : null;
                          return (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono font-medium text-gray-800">{t.numeroTransfert}</td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-800">{t.entrepotNom}</p>
                                <p className="text-xs text-gray-400">{t.delegueNom} {t.deleguePrenoms}</p>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">{t.poidsDepart_kg ? kg(t.poidsDepart_kg) : "—"}</td>
                              <td className="px-4 py-3 text-right text-gray-700">{t.poidsArrivee_kg ? kg(t.poidsArrivee_kg) : "—"}</td>
                              <td className="px-4 py-3 text-right">
                                {ecart !== null ? (
                                  <span className={`text-xs font-medium ${Math.abs(ecart) > 0 ? "text-red-600" : "text-green-600"}`}>
                                    {ecart > 0 ? "-" : "+"}{kg(Math.abs(ecart))}
                                    {pctEc !== null && ` (${pctEc.toFixed(1)}%)`}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3 text-center"><StatutBadge statut={t.statut} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
          </div>
        </div>
      )}

      {/* Modal confirmation arrivée */}
      {showArrivee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmer la réception</h2>
            <p className="text-sm text-gray-500 mb-4">
              Transfert <span className="font-mono font-semibold">{showArrivee.numeroTransfert}</span>
              {" — "}Poids départ : <strong>{kg(showArrivee.poidsDepart_kg)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Poids reçu (kg) *</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={formArrivee.poidsArrivee_kg}
                  onChange={(e) => {
                    const dep = parseFloat(showArrivee.poidsDepart_kg ?? "0");
                    const arr = parseFloat(e.target.value);
                    setFormArrivee(f => ({ ...f, poidsArrivee_kg: e.target.value }));
                    if (dep && arr) {
                      const pctEc = Math.abs((dep - arr) / dep * 100);
                      if (pctEc > 0.5) setFormArrivee(f => ({ ...f, poidsArrivee_kg: e.target.value }));
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                {formArrivee.poidsArrivee_kg && showArrivee.poidsDepart_kg && (() => {
                  const dep = parseFloat(showArrivee.poidsDepart_kg ?? "0");
                  const arr = parseFloat(formArrivee.poidsArrivee_kg);
                  const ec = dep - arr;
                  const p = dep ? Math.abs(ec / dep * 100) : 0;
                  const isLitige = p > 0.5;
                  return (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${isLitige ? "text-red-600" : "text-green-600"}`}>
                      {isLitige ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      Écart : {ec.toFixed(0)} kg ({p.toFixed(1)}%)
                      {isLitige ? " → Litige automatique" : " → OK"}
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'écart</label>
                <select value={formArrivee.motifEcart}
                  onChange={(e) => setFormArrivee(f => ({ ...f, motifEcart: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
                  <option value="">— Aucun —</option>
                  <option value="evaporation">Évaporation</option>
                  <option value="perte">Perte</option>
                  <option value="erreur_pesee">Erreur de pesée</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={formArrivee.notes}
                  onChange={(e) => setFormArrivee(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowArrivee(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formArrivee.poidsArrivee_kg || mutArrivee.isPending}
                onClick={() => mutArrivee.mutate({
                  id: showArrivee.id,
                  body: {
                    poidsArrivee_kg: parseFloat(formArrivee.poidsArrivee_kg),
                    motifEcart: formArrivee.motifEcart || undefined,
                    notes: formArrivee.notes || undefined,
                  },
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutArrivee.isPending ? "En cours…" : "Confirmer la réception"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal créer entrepôt */}
      {showCreer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nouvel entrepôt délégué</h2>
            <div className="space-y-3">
              {[
                { key: "delegueId", label: "ID Délégué *", type: "number", placeholder: "ex: 42" },
                { key: "nom", label: "Nom de l'entrepôt *", type: "text", placeholder: "ex: Point collecte Broukro" },
                { key: "zoneNom", label: "Zone / Village", type: "text", placeholder: "ex: Broukro" },
                { key: "capaciteMaxKg", label: "Capacité max (kg)", type: "number", placeholder: "ex: 15000" },
                { key: "seuilAlerteKg", label: "Seuil d'alerte (kg)", type: "number", placeholder: "ex: 12000" },
                { key: "adresse", label: "Adresse", type: "text", placeholder: "Adresse physique" },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} placeholder={placeholder}
                    value={formCreer[key as keyof typeof formCreer]}
                    onChange={(e) => setFormCreer(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de zone</label>
                <select value={formCreer.zoneType}
                  onChange={(e) => setFormCreer(f => ({ ...f, zoneType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
                  <option value="village">Village</option>
                  <option value="section">Section</option>
                  <option value="groupement">Groupement</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreer(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formCreer.delegueId || !formCreer.nom || mutCreer.isPending}
                onClick={() => mutCreer.mutate({
                  delegueId: parseInt(formCreer.delegueId),
                  nom: formCreer.nom,
                  zoneNom: formCreer.zoneNom || undefined,
                  zoneType: formCreer.zoneType || undefined,
                  capaciteMaxKg: formCreer.capaciteMaxKg ? parseFloat(formCreer.capaciteMaxKg) : undefined,
                  seuilAlerteKg: formCreer.seuilAlerteKg ? parseFloat(formCreer.seuilAlerteKg) : undefined,
                  adresse: formCreer.adresse || undefined,
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutCreer.isPending ? "Création…" : "Créer l'entrepôt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
