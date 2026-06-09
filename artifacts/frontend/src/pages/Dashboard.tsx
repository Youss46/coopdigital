import { useGetDashboard, useGetDashboardLivraisons, useGetDashboardAvancesRetard } from "@workspace/api-client-react";
import { Users, TrendingUp, Package, Banknote, AlertTriangle, Clock } from "lucide-react";

function formaterFCFA(montant: number) {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}

function formaterDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function CarteKpi({
  titre,
  valeur,
  icone: Icone,
  couleur,
  sousTitre,
}: {
  titre: string;
  valeur: string;
  icone: React.ElementType;
  couleur: string;
  sousTitre?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: couleur + "15" }}>
        <Icone size={22} style={{ color: couleur }} />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{titre}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{valeur}</p>
        {sousTitre && <p className="text-xs text-gray-400 mt-0.5">{sousTitre}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: kpi, isLoading: kpiChargement } = useGetDashboard();
  const { data: livraisons } = useGetDashboardLivraisons();
  const { data: avancesRetard } = useGetDashboardAvancesRetard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de la coopérative</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiChargement ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
          ))
        ) : (
          <>
            <CarteKpi
              titre="Membres actifs"
              valeur={String(kpi?.membresActifs ?? 0)}
              icone={Users}
              couleur="#1a4731"
              sousTitre={
                kpi?.membresHommes != null
                  ? `Hommes : ${kpi.membresHommes} · Femmes : ${kpi.membresFemmes ?? 0}`
                  : "Membres enregistrés"
              }
            />
            <CarteKpi
              titre="Avances en cours"
              valeur={formaterFCFA(kpi?.avancesEnCoursMontant ?? 0)}
              icone={CreditCard2}
              couleur="#c4962a"
              sousTitre="Solde total dû"
            />
            <CarteKpi
              titre="Tonnage ce mois"
              valeur={`${((kpi?.tonnageMois ?? 0) / 1000).toFixed(2)} T`}
              icone={Package}
              couleur="#2563eb"
              sousTitre="Cacao collecté"
            />
            <CarteKpi
              titre="Paiements ce mois"
              valeur={formaterFCFA(kpi?.paiementsMois ?? 0)}
              icone={Banknote}
              couleur="#16a34a"
              sousTitre="Confirmés"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dernières livraisons */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Dernières livraisons</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!livraisons || livraisons.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune livraison</p>
            ) : (
              livraisons.map((l) => (
                <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {l.membreNom} {l.membrePrenoms}
                    </p>
                    <p className="text-xs text-gray-400">{formaterDate(l.dateLivraison)} · {Number(l.poidsKg).toFixed(1)} kg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formaterFCFA(l.montantNetFcfa)}</p>
                    {l.avanceDeduiteFcfa > 0 && (
                      <p className="text-xs text-amber-600">-{formaterFCFA(l.avanceDeduiteFcfa)} avance</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Avances en retard */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Avances en retard</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!avancesRetard || avancesRetard.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune avance en retard</p>
            ) : (
              avancesRetard.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {a.membreNom} {a.membrePrenoms}
                    </p>
                    <p className="text-xs text-gray-400">
                      Échéance : {a.dateEcheance ? formaterDate(a.dateEcheance) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{formaterFCFA(a.soldeRestantFcfa)}</p>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">En retard</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditCard2(props: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 24, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}
