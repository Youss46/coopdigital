import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wallet, AlertTriangle, TrendingUp, Users, Landmark,
  RefreshCw, ArrowRight, CheckCircle2, Clock, BarChart3,
} from "lucide-react";
import { formaterFCFACourt } from "@/lib/formatters";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const FCFA = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + " FCFA";

const MOIS = [
  "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

interface TableauBord {
  tresorerie: {
    totalCaissesFcfa: number;
    nombreCaisses: number;
    nombreCaissesBasses: number;
  };
  creances: {
    totalEnRetardFcfa: number;
    nbEnRetard: number;
    totalNonRegleFcfa: number;
    nbNonRegle: number;
  };
  budget: {
    campagneNom: string;
    totalPrevFcfa: number;
    totalReelFcfa: number;
    tauxExecution: number;
    nbDepassements: number;
  } | null;
  salaires: {
    mois: number;
    annee: number;
    montantAPayerFcfa: number;
    nbBulletinsNonPaies: number;
  };
  avances: {
    totalEncoursFcfa: number;
    nombreEncours: number;
  };
  emprunts: {
    totalSoldeRestantFcfa: number;
    nombreEnCours: number;
  };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  montantFcfa,
  sub,
  alert,
  ok,
  href,
  iconBg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  montantFcfa?: number;
  sub?: string;
  alert?: boolean;
  ok?: boolean;
  href: string;
  iconBg: string;
}) {
  return (
    <Link href={href}>
      <div className={`bg-white rounded-xl border p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow ${alert ? "border-red-200" : ok ? "border-green-200" : "border-gray-100"}`}>
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-lg ${iconBg}`}>
            <Icon size={20} className={alert ? "text-red-600" : ok ? "text-green-600" : "text-gray-600"} />
          </div>
          {alert && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} /> Alerte
            </span>
          )}
          {ok && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={11} /> OK
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium mb-0.5 truncate">{label}</p>
          {montantFcfa !== undefined ? (
            <>
              <p className={`hidden sm:block text-xl font-bold ${alert ? "text-red-700" : "text-gray-900"}`}>{value}</p>
              <p className={`sm:hidden text-lg font-bold truncate ${alert ? "text-red-700" : "text-gray-900"}`}>{formaterFCFACourt(montantFcfa)}</p>
            </>
          ) : (
            <p className={`text-xl font-bold ${alert ? "text-red-700" : "text-gray-900"}`}>{value}</p>
          )}
          {sub && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{sub}</p>}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400 font-medium mt-auto">
          Voir le détail <ArrowRight size={12} />
        </div>
      </div>
    </Link>
  );
}

function BudgetCard({ budget }: { budget: NonNullable<TableauBord["budget"]> }) {
  const pct = Math.min(budget.tauxExecution, 100);
  const over = budget.tauxExecution > 100;
  const alert = budget.nbDepassements > 0 || over;

  return (
    <Link href="/budget">
      <div className={`bg-white rounded-xl border p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow ${alert ? "border-orange-200" : "border-gray-100"}`}>
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-lg ${alert ? "bg-orange-50" : "bg-blue-50"}`}>
            <BarChart3 size={20} className={alert ? "text-orange-600" : "text-blue-600"} />
          </div>
          {alert && (
            <span className="flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} /> {budget.nbDepassements} dépassement{budget.nbDepassements > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-0.5">Budget — {budget.campagneNom}</p>
          <p className="text-xl font-bold text-gray-900">{budget.tauxExecution}% exécuté</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {FCFA(budget.totalReelFcfa)} sur {FCFA(budget.totalPrevFcfa)}
          </p>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-orange-400" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-1 text-xs text-gray-400 font-medium mt-auto">
          Voir le budget <ArrowRight size={12} />
        </div>
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 h-40 animate-pulse">
          <div className="bg-gray-100 rounded-lg w-10 h-10 mb-4" />
          <div className="bg-gray-100 rounded w-2/3 h-3 mb-2" />
          <div className="bg-gray-100 rounded w-1/2 h-5" />
        </div>
      ))}
    </div>
  );
}

export default function FinancesTableauBordPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<TableauBord>({
    queryKey: ["finances-tableau-bord"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/finances/tableau-bord`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error("Erreur serveur");
      return r.json() as Promise<TableauBord>;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord financier</h1>
          <p className="text-gray-500 text-sm mt-1">Vue consolidée de la situation financière de la coopérative</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {isLoading && <Skeleton />}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600">
          <AlertTriangle className="mx-auto mb-2" size={24} />
          <p className="font-medium">Impossible de charger les données financières</p>
          <button onClick={() => refetch()} className="mt-3 text-sm underline">Réessayer</button>
        </div>
      )}

      {data && (
        <>
          {/* Grille KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Trésorerie */}
            <KpiCard
              icon={Wallet}
              label="Trésorerie — caisses actives"
              value={FCFA(data.tresorerie.totalCaissesFcfa)}
              montantFcfa={data.tresorerie.totalCaissesFcfa}
              sub={`${data.tresorerie.nombreCaisses} caisse${data.tresorerie.nombreCaisses > 1 ? "s" : ""} active${data.tresorerie.nombreCaisses > 1 ? "s" : ""}`}
              alert={data.tresorerie.nombreCaissesBasses > 0}
              ok={data.tresorerie.nombreCaissesBasses === 0 && data.tresorerie.totalCaissesFcfa > 0}
              href="/caisse"
              iconBg={data.tresorerie.nombreCaissesBasses > 0 ? "bg-red-50" : "bg-green-50"}
            />

            {/* Créances en retard */}
            <KpiCard
              icon={AlertTriangle}
              label="Créances en retard"
              value={FCFA(data.creances.totalEnRetardFcfa)}
              montantFcfa={data.creances.totalEnRetardFcfa}
              sub={
                data.creances.nbEnRetard > 0
                  ? `${data.creances.nbEnRetard} exportateur${data.creances.nbEnRetard > 1 ? "s" : ""} en retard · Total non réglé : ${FCFA(data.creances.totalNonRegleFcfa)}`
                  : `Aucun retard · Total non réglé : ${FCFA(data.creances.totalNonRegleFcfa)}`
              }
              alert={data.creances.nbEnRetard > 0}
              ok={data.creances.nbEnRetard === 0}
              href="/creances"
              iconBg={data.creances.nbEnRetard > 0 ? "bg-red-50" : "bg-green-50"}
            />

            {/* Salaires */}
            <KpiCard
              icon={Users}
              label={`Salaires à payer — ${MOIS[data.salaires.mois]} ${data.salaires.annee}`}
              value={FCFA(data.salaires.montantAPayerFcfa)}
              montantFcfa={data.salaires.montantAPayerFcfa}
              sub={
                data.salaires.nbBulletinsNonPaies > 0
                  ? `${data.salaires.nbBulletinsNonPaies} bulletin${data.salaires.nbBulletinsNonPaies > 1 ? "s" : ""} en attente de paiement`
                  : "Tous les bulletins du mois sont payés"
              }
              alert={data.salaires.nbBulletinsNonPaies > 0 && data.salaires.montantAPayerFcfa > 0}
              ok={data.salaires.nbBulletinsNonPaies === 0}
              href="/salaires"
              iconBg={data.salaires.nbBulletinsNonPaies > 0 ? "bg-orange-50" : "bg-green-50"}
            />

            {/* Budget */}
            {data.budget ? (
              <BudgetCard budget={data.budget} />
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 text-gray-400">
                <BarChart3 size={24} />
                <p className="text-sm">Aucune campagne ouverte avec budget</p>
                <Link href="/budget" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                  Créer un budget <ArrowRight size={11} />
                </Link>
              </div>
            )}

            {/* Avances en cours */}
            <KpiCard
              icon={TrendingUp}
              label="Avances membres en cours"
              value={FCFA(data.avances.totalEncoursFcfa)}
              montantFcfa={data.avances.totalEncoursFcfa}
              sub={
                data.avances.nombreEncours > 0
                  ? `${data.avances.nombreEncours} avance${data.avances.nombreEncours > 1 ? "s" : ""} non remboursée${data.avances.nombreEncours > 1 ? "s" : ""}`
                  : "Aucune avance en cours"
              }
              alert={false}
              ok={data.avances.nombreEncours === 0}
              href="/avances"
              iconBg="bg-purple-50"
            />

            {/* Emprunts */}
            <KpiCard
              icon={Landmark}
              label="Emprunts en cours — capital restant"
              value={FCFA(data.emprunts.totalSoldeRestantFcfa)}
              montantFcfa={data.emprunts.totalSoldeRestantFcfa}
              sub={
                data.emprunts.nombreEnCours > 0
                  ? `${data.emprunts.nombreEnCours} emprunt${data.emprunts.nombreEnCours > 1 ? "s" : ""} actif${data.emprunts.nombreEnCours > 1 ? "s" : ""}`
                  : "Aucun emprunt en cours"
              }
              alert={false}
              ok={data.emprunts.nombreEnCours === 0}
              href="/emprunts"
              iconBg="bg-indigo-50"
            />
          </div>

          {/* Liens rapides */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Accès rapide</p>
            <div className="flex flex-wrap gap-2">
              {[
                { href: "/comptabilite", label: "Comptabilité" },
                { href: "/caisse", label: "Caisse" },
                { href: "/reconciliation", label: "Réconciliation bancaire" },
                { href: "/fiscalite", label: "Fiscalité" },
                { href: "/investissements", label: "Investissements" },
                { href: "/subventions", label: "Subventions" },
                { href: "/reglements", label: "Règlements membres" },
                { href: "/reporting", label: "Reporting" },
              ].map((l) => (
                <Link key={l.href} href={l.href}>
                  <span className="inline-flex items-center gap-1 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors cursor-pointer">
                    {l.label} <ArrowRight size={12} className="text-gray-400" />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Note actualisation */}
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Clock size={12} />
            Données actualisées toutes les 2 minutes. Dernière mise à jour : {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </>
      )}
    </div>
  );
}
