import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  Banknote,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  LayoutDashboard,
  RefreshCw,
  Users,
  Package,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { CarteKpi } from "@/components/CarteKpi";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => r.json());

function formaterFCFA(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) || 0 : n;
  return new Intl.NumberFormat("fr-FR").format(v) + " FCFA";
}
function formaterHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formaterDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

interface Caisse {
  id: number;
  nom: string;
  type_caisse: string;
  solde_actuel_fcfa: string;
  fond_caisse_minimum_fcfa: string;
  actif: boolean;
  session_id: number | null;
  session_statut: string | null;
  heure_ouverture: string | null;
  solde_ouverture_fcfa: string | null;
}

interface Mouvement {
  id: number;
  type: string;
  motif: string;
  montant_fcfa: string;
  libelle: string | null;
  solde_apres_fcfa: string | null;
  created_at: string;
  enregistre_par_nom: string | null;
}

interface Journal {
  mouvements: Mouvement[];
  totalEntrees: number;
  totalSorties: number;
}

interface DashboardData {
  membresActifs: number;
  avancesEnCoursMontant: number;
  avancesEnRetardNb: number;
}

interface Avance {
  id: number;
  montantFcfa: number;
  statut: string;
  createdAt: string;
  membreNom: string | null;
  membrePrenoms: string | null;
}

function WidgetSessionCaisse({ caisse, onNavigate }: { caisse: Caisse; onNavigate: () => void }) {
  const solde = parseFloat(caisse.solde_actuel_fcfa);
  const minimum = parseFloat(caisse.fond_caisse_minimum_fcfa);
  const sessionOuverte = caisse.session_statut === "ouverte";
  const soldeInsuffisant = minimum > 0 && solde < minimum;
  const pct = minimum > 0 ? Math.min(100, (solde / (minimum * 2 || 1)) * 100) : 100;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-amber-300 transition group"
      onClick={onNavigate}
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-amber-600" />
          <span className="font-semibold text-gray-800">{caisse.nom}</span>
          <span className="text-xs text-gray-400 capitalize">({caisse.type_caisse})</span>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:text-amber-500 transition" />
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Solde actuel</p>
          <p className={`text-lg font-bold ${soldeInsuffisant ? "text-red-600" : "text-gray-900"}`}>
            {formaterFCFA(solde)}
          </p>
          {soldeInsuffisant && (
            <p className="text-xs text-red-500 mt-0.5">
              Sous le minimum ({formaterFCFA(minimum)})
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-0.5">Session</p>
          <div className="flex items-center gap-1.5">
            {sessionOuverte ? (
              <>
                <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-emerald-700">Ouverte</span>
              </>
            ) : (
              <>
                <XCircle size={15} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-500">Fermée</span>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-0.5">
            {sessionOuverte ? "Ouverte à" : "Dernière session"}
          </p>
          {caisse.heure_ouverture ? (
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                {formaterHeure(caisse.heure_ouverture)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>
      </div>

      {minimum > 0 && (
        <div className="px-5 pb-4">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${soldeInsuffisant ? "bg-red-400" : "bg-emerald-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Fond minimum : {formaterFCFA(minimum)}</p>
        </div>
      )}
    </div>
  );
}

const MOTIF_LABELS: Record<string, string> = {
  paiement_producteur: "Paiement producteur",
  avance: "Avance membre",
  achat_intrants: "Achat intrants",
  frais_fonctionnement: "Frais fonct.",
  depot_banque: "Dépôt banque",
  retrait_banque: "Retrait banque",
  don: "Don / subvention",
  remboursement: "Remboursement",
  autre: "Autre",
};

export default function DashboardCaissier() {
  const { utilisateur } = useAuth();
  const [, navigate] = useLocation();

  const today = new Date().toISOString().split("T")[0]!;

  const { data: caisses = [], isLoading: loadingCaisses, refetch: refetchCaisses } = useQuery<Caisse[]>({
    queryKey: ["dashboard-caissier-caisses"],
    queryFn: () => apiFetch("/api/caisse"),
    refetchInterval: 60_000,
  });

  const { data: dashboard, isLoading: loadingDashboard } = useQuery<DashboardData>({
    queryKey: ["dashboard-caissier-stats"],
    queryFn: () => apiFetch("/api/dashboard"),
    refetchInterval: 60_000,
  });

  const premiereCaisseId = caisses[0]?.id ?? null;
  const { data: journal, isLoading: loadingJournal } = useQuery<Journal>({
    queryKey: ["dashboard-caissier-journal", premiereCaisseId, today],
    queryFn: () => apiFetch(`/api/caisse/${premiereCaisseId}/journal?dateDebut=${today}&dateFin=${today}`),
    enabled: premiereCaisseId !== null,
    refetchInterval: 60_000,
  });

  const { data: avances = [], isLoading: loadingAvances } = useQuery<{ avances: Avance[] }>({
    queryKey: ["dashboard-caissier-avances", today],
    queryFn: () => apiFetch(`/api/avances?dateDebut=${today}&dateFin=${today}`),
    refetchInterval: 60_000,
  });

  const loading = loadingCaisses || loadingDashboard;

  const totalCaisses = caisses.reduce((acc, c) => acc + parseFloat(c.solde_actuel_fcfa), 0);
  const nbSessionsOuvertes = caisses.filter((c) => c.session_statut === "ouverte").length;
  const nbCaissesAlerte = caisses.filter(
    (c) => parseFloat(c.fond_caisse_minimum_fcfa) > 0 && parseFloat(c.solde_actuel_fcfa) < parseFloat(c.fond_caisse_minimum_fcfa)
  ).length;

  const avancesListe: Avance[] = Array.isArray(avances) ? avances : (avances as { avances: Avance[] }).avances ?? [];
  const nbAvancesJour = avancesListe.length;
  const montantAvancesJour = avancesListe.reduce((acc, a) => acc + (a.montantFcfa ?? 0), 0);

  const mouvements: Mouvement[] = journal?.mouvements ?? [];
  const entreesJour = journal?.totalEntrees ?? 0;
  const sortiesJour = journal?.totalSorties ?? 0;

  function refresh() {
    refetchCaisses();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* ── En-tête ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-pink-50">
            <LayoutDashboard size={22} className="text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Bonjour, {utilisateur?.prenoms ?? utilisateur?.nom} 👋
            </h1>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <RefreshCw size={15} />
          Actualiser
        </button>
      </div>

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CarteKpi
            titre="Total caisses"
            valeur={formaterFCFA(totalCaisses)}
            montantFcfa={totalCaisses}
            icone={Wallet}
            couleur="#be185d"
            sousTitre={`${caisses.length} caisse${caisses.length > 1 ? "s" : ""}`}
            badge={nbCaissesAlerte > 0 ? { texte: `${nbCaissesAlerte} alerte${nbCaissesAlerte > 1 ? "s" : ""}`, type: "danger" } : undefined}
          />
          <CarteKpi
            titre="Sessions ouvertes"
            valeur={`${nbSessionsOuvertes} / ${caisses.length}`}
            icone={CheckCircle2}
            couleur="#059669"
            sousTitre={nbSessionsOuvertes > 0 ? "Caisse active" : "Aucune session active"}
          />
          <CarteKpi
            titre="Entrées du jour"
            valeur={formaterFCFA(entreesJour)}
            montantFcfa={entreesJour}
            icone={TrendingUp}
            couleur="#0284c7"
            sousTitre={loadingJournal ? "Chargement…" : undefined}
          />
          <CarteKpi
            titre="Sorties du jour"
            valeur={formaterFCFA(sortiesJour)}
            montantFcfa={sortiesJour}
            icone={TrendingDown}
            couleur="#d97706"
            sousTitre={loadingJournal ? "Chargement…" : undefined}
          />
        </div>
      )}

      {/* ── Ligne 2 : avances + membres ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CarteKpi
            titre="Avances octroyées (aujourd'hui)"
            valeur={nbAvancesJour > 0 ? `${nbAvancesJour} avance${nbAvancesJour > 1 ? "s" : ""}` : "Aucune"}
            icone={Banknote}
            couleur="#7c3aed"
            sousTitre={nbAvancesJour > 0 ? formaterFCFA(montantAvancesJour) : undefined}
          />
          <CarteKpi
            titre="Avances en cours"
            valeur={formaterFCFA(dashboard?.avancesEnCoursMontant ?? 0)}
            montantFcfa={dashboard?.avancesEnCoursMontant ?? 0}
            icone={Clock}
            couleur="#0891b2"
            badge={
              (dashboard?.avancesEnRetardNb ?? 0) > 0
                ? { texte: `${dashboard!.avancesEnRetardNb} en retard`, type: "warning" }
                : undefined
            }
          />
          <CarteKpi
            titre="Membres actifs"
            valeur={String(dashboard?.membresActifs ?? "—")}
            icone={Users}
            couleur="#15803d"
            sousTitre="dans la coopérative"
          />
        </div>
      )}

      {/* ── Caisses ── */}
      {caisses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Mes caisses
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {caisses.map((c) => (
              <WidgetSessionCaisse
                key={c.id}
                caisse={c}
                onNavigate={() => navigate("/caisse")}
              />
            ))}
          </div>
        </section>
      )}

      {caisses.length === 0 && !loadingCaisses && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center gap-4">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Aucune caisse configurée</p>
            <p className="text-sm text-amber-600">Contactez un administrateur pour créer et vous assigner une caisse.</p>
          </div>
        </div>
      )}

      {/* ── Derniers mouvements ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Mouvements du jour
          </h2>
          <button
            onClick={() => navigate("/caisse")}
            className="text-xs text-pink-600 hover:text-pink-800 font-medium flex items-center gap-1"
          >
            Voir tout <ChevronRight size={13} />
          </button>
        </div>

        {loadingJournal ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-32" />
        ) : mouvements.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">
            <Package size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Aucun mouvement enregistré aujourd'hui</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Heure</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Motif</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Libellé</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Montant</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Solde après</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mouvements.slice(0, 10).map((m) => {
                  const entree = m.type === "entree";
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formaterHeure(m.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entree ? (
                            <TrendingUp size={13} className="text-emerald-500 flex-shrink-0" />
                          ) : (
                            <TrendingDown size={13} className="text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-gray-700">
                            {MOTIF_LABELS[m.motif] ?? m.motif}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell max-w-[180px] truncate">
                        {m.libelle ?? "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold text-sm ${entree ? "text-emerald-600" : "text-red-500"}`}>
                        {entree ? "+" : "-"}{formaterFCFA(parseFloat(m.montant_fcfa))}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400 hidden sm:table-cell">
                        {m.solde_apres_fcfa ? formaterFCFA(parseFloat(m.solde_apres_fcfa)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mouvements.length > 10 && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => navigate("/caisse")}
                  className="text-sm text-pink-600 hover:text-pink-800 font-medium"
                >
                  Voir les {mouvements.length - 10} autres mouvements →
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Raccourcis ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Accès rapide</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Caisse", href: "/caisse", icon: Wallet, color: "#be185d" },
            { label: "Avances", href: "/avances", icon: Banknote, color: "#7c3aed" },
            { label: "Règlements", href: "/reglements", icon: CheckCircle2, color: "#059669" },
            { label: "Membres", href: "/membres", icon: Users, color: "#0284c7" },
          ].map(({ label, href, icon: Icon, color }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center gap-2.5 hover:border-gray-300 hover:shadow-sm transition text-center"
            >
              <div className="rounded-lg p-2" style={{ backgroundColor: color + "18" }}>
                <Icon size={20} style={{ color }} />
              </div>
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
