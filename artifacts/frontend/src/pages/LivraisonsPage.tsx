import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Package, Search, Plus, Loader2, ChevronRight, Calendar,
  Scale, Banknote, TrendingDown, ArrowDownCircle, FileDown,
  Warehouse, ChevronDown, MapPin, User, Printer,
} from "lucide-react";

const ROLES_CREER = ["pca", "directeur", "delegue"];
const ROLES_VOIR_DELEGUES = ["pca", "directeur", "magasinier", "comptable", "auditeur"];

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => r.json());

// ─── Types ───────────────────────────────────────────────────────────────────

interface EntrepotDelegue {
  id: number;
  nom: string;
  zoneNom: string | null;
  zoneType: string | null;
  stockActuelKg: string | null;
  capaciteMaxKg: string | null;
  seuilAlerteKg: string | null;
  actif: boolean;
  delegueNom: string | null;
  deleguePrenoms: string | null;
}

interface Livraison {
  id: number;
  membreId: number;
  membreNom: string | null;
  membrePrenoms: string | null;
  poidsKg: string;
  prixUnitaireFcfa: number | null;
  montantBrutFcfa: number | null;
  avanceDeduiteFcfa: number | null;
  intrantsDeduitsFcfa: number | null;
  montantNetFcfa: number | null;
  dateLivraison: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(Number(n)) + " FCFA";
}

function fmtPoids(v: string | null | undefined) {
  if (!v) return "—";
  return parseFloat(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " kg";
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LivraisonsPage() {
  const { utilisateur } = useAuth();
  const peutCreer = ROLES_CREER.includes(utilisateur?.role ?? "");
  const voitDelegues = ROLES_VOIR_DELEGUES.includes(utilisateur?.role ?? "");
  const [recherche, setRecherche] = useState("");
  const [deleguesOuvert, setDeleguesOuvert] = useState(true);

  const { data: livraisons = [], isLoading } = useQuery<Livraison[]>({
    queryKey: ["livraisons-liste"],
    queryFn: () => apiFetch("/api/livraisons?limit=100"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: entrepotsDelegues = [] } = useQuery<EntrepotDelegue[]>({
    queryKey: ["entrepots-delegues-liste"],
    queryFn: () => apiFetch("/api/entrepots"),
    enabled: voitDelegues,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const filtres = livraisons.filter((l) => {
    if (!recherche) return true;
    const r = recherche.toLowerCase();
    return (
      (l.membreNom ?? "").toLowerCase().includes(r) ||
      (l.membrePrenoms ?? "").toLowerCase().includes(r)
    );
  });

  const totalPoids = livraisons.reduce((s, l) => s + parseFloat(l.poidsKg ?? "0"), 0);
  const totalNet = livraisons.reduce((s, l) => s + (l.montantNetFcfa ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Livraisons</h1>
          <p className="text-gray-500 text-sm mt-0.5">Historique des pesées de cacao</p>
        </div>
        {peutCreer && (
          <Link href="/livraisons/nouvelle">
            <a className="flex items-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-xl"
               style={{ backgroundColor: "#1a4731" }}>
              <Plus size={15} />
              Nouvelle livraison
            </a>
          </Link>
        )}
      </div>

      {/* KPIs résumé */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Package size={14} className="text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Livraisons</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{livraisons.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtPoids(String(totalPoids))} total</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Banknote size={14} className="text-amber-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Montant net</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {new Intl.NumberFormat("fr-FR").format(totalNet)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">FCFA</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par nom de producteur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
        />
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-gray-300" size={32} />
        </div>
      ) : filtres.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Package size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">
            {recherche ? "Aucun résultat pour cette recherche" : "Aucune livraison enregistrée"}
          </p>
          {!recherche && peutCreer && (
            <Link href="/livraisons/nouvelle">
              <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white px-4 py-2 rounded-lg"
                 style={{ backgroundColor: "#1a4731" }}>
                <Plus size={14} />
                Enregistrer une livraison
              </a>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtres.map((l) => (
            <LivraisonRow key={l.id} livraison={l} />
          ))}
        </div>
      )}

      {/* ─── Entrepôts délégués ─────────────────────────────────────────── */}
      {voitDelegues && entrepotsDelegues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setDeleguesOuvert((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <Warehouse size={14} className="text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-gray-800">
                Entrepôts délégués
              </span>
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                {entrepotsDelegues.length}
              </span>
            </div>
            <ChevronDown
              size={15}
              className={`text-gray-400 transition-transform ${deleguesOuvert ? "rotate-180" : ""}`}
            />
          </button>

          {deleguesOuvert && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {entrepotsDelegues.map((e) => {
                const stock = parseFloat(e.stockActuelKg ?? "0");
                const capacite = parseFloat(e.capaciteMaxKg ?? "0");
                const seuil = parseFloat(e.seuilAlerteKg ?? "0");
                const pct = capacite > 0 ? Math.round((stock / capacite) * 100) : 0;
                const alerteStock = seuil > 0 && stock >= seuil;
                return (
                  <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        alerteStock ? "bg-orange-100" : "bg-green-50"
                      }`}
                    >
                      <Warehouse size={14} className={alerteStock ? "text-orange-500" : "text-green-600"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.nom}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {e.zoneNom && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin size={9} /> {e.zoneNom}
                          </span>
                        )}
                        {(e.delegueNom || e.deleguePrenoms) && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <User size={9} /> {e.deleguePrenoms} {e.delegueNom}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${alerteStock ? "text-orange-600" : "text-gray-900"}`}>
                        {stock.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg
                      </p>
                      {capacite > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">{pct}% capacité</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LivraisonRow ─────────────────────────────────────────────────────────────

async function fetchRecuBlob(id: number): Promise<Blob | null> {
  const res = await fetch(`${BASE}/api/rapports/recu/livraison/${id}`, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) return null;
  return res.blob();
}

async function downloadRecuLivraison(id: number) {
  const blob = await fetchRecuBlob(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recu_livraison_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

async function printRecuLivraison(id: number) {
  const blob = await fetchRecuBlob(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("load", () => { win.print(); });
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function LivraisonRow({ livraison: l }: { livraison: Livraison }) {
  const [ouvert, setOuvert] = useState(false);
  const [downloadingRecu, setDownloadingRecu] = useState(false);
  const [printingRecu, setPrintingRecu] = useState(false);
  const poids = parseFloat(l.poidsKg ?? "0");

  return (
    <div>
      <button
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        onClick={() => setOuvert((v) => !v)}
      >
        {/* Avatar initiales */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: "#1a4731" }}
        >
          {(l.membreNom ?? "?")[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {l.membreNom ?? "—"} {l.membrePrenoms ?? ""}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar size={10} /> {fmtDate(l.dateLivraison)}
            </span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Scale size={10} /> {poids.toFixed(1)} kg
            </span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">{fmt(l.montantNetFcfa)}</p>
          {l.prixUnitaireFcfa && (
            <p className="text-xs text-gray-400">{l.prixUnitaireFcfa} FCFA/kg</p>
          )}
        </div>

        <ChevronRight
          size={15}
          className={`text-gray-300 flex-shrink-0 transition-transform ${ouvert ? "rotate-90" : ""}`}
        />
      </button>

      {/* Détail dépliable */}
      {ouvert && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100 space-y-1.5">
          <DetailLine label="Montant brut"   value={fmt(l.montantBrutFcfa)} />
          {(l.avanceDeduiteFcfa ?? 0) > 0 && (
            <DetailLine
              label="Avance déduite"
              value={`− ${fmt(l.avanceDeduiteFcfa)}`}
              icon={<TrendingDown size={11} className="text-orange-500" />}
              valueCls="text-orange-600"
            />
          )}
          {(l.intrantsDeduitsFcfa ?? 0) > 0 && (
            <DetailLine
              label="Intrants déduits"
              value={`− ${fmt(l.intrantsDeduitsFcfa)}`}
              icon={<ArrowDownCircle size={11} className="text-blue-500" />}
              valueCls="text-blue-600"
            />
          )}
          <div className="border-t border-gray-200 pt-1.5 mt-1.5">
            <DetailLine
              label="Net à payer"
              value={fmt(l.montantNetFcfa)}
              labelCls="font-semibold text-gray-800"
              valueCls="font-bold text-green-700"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setDownloadingRecu(true);
                await downloadRecuLivraison(l.id);
                setDownloadingRecu(false);
              }}
              disabled={downloadingRecu || printingRecu}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a4731" }}
            >
              {downloadingRecu ? <Loader2 size={12} className="animate-spin" /> : <><FileDown size={12} /> Télécharger</>}
            </button>
            <button
              onClick={async () => {
                setPrintingRecu(true);
                await printRecuLivraison(l.id);
                setPrintingRecu(false);
              }}
              disabled={downloadingRecu || printingRecu}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium disabled:opacity-50 border"
              style={{ borderColor: "#1a4731", color: "#1a4731" }}
            >
              {printingRecu ? <Loader2 size={12} className="animate-spin" /> : <><Printer size={12} /> Imprimer</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label, value, icon, labelCls = "text-gray-500", valueCls = "text-gray-800",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  labelCls?: string;
  valueCls?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={`flex items-center gap-1 ${labelCls}`}>{icon}{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}
