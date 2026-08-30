import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Ship,
  Truck,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, token: string | null): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${response.status}`);
  }
  return body as T;
}

type CentralWarehouse = {
  id: number;
  nom: string;
  ville: string;
  capaciteKg: string | number;
  stockActuelKg: string | number;
  nombreSacsTotal?: number | null;
  enAlerte?: boolean;
};

type DelegatedWarehouseStats = {
  entrepots?: Array<{ id: number; nom: string; stockActuelKg?: string | number | null }>;
  stockTotalEntrepotsKg?: number;
  totalSacsEntrepots?: number;
  transfertsEnCours?: number;
  alertesCapacite?: number;
};

type SacherieResume = {
  stockDisponible: number;
  sacsDetenus: number;
  typesActifs: number;
  membresDelegues: number;
  alertes: number;
};

type SacType = {
  id: number;
  nom: string;
  stockDisponible: number;
  stockMinimum: number;
  enAlerte: boolean;
};

type ExpeditionStats = {
  enCours: number;
  receptionnes: number;
  litiges: number;
};

type TransportMission = {
  mission?: { statut?: string | null };
};

function numberValue(value: string | number | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function formatKg(value: string | number | null | undefined) {
  const kg = numberValue(value);
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg`;
}

function formatCount(value: number | null | undefined) {
  return numberValue(value).toLocaleString("fr-FR");
}

function LoadingValue() {
  return <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" aria-label="Chargement" />;
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ElementType;
  tone: "green" | "amber" | "blue" | "rose";
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <Card className={styles}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs opacity-80">{caption}</p>
        </div>
        <div className="rounded-lg bg-white/70 p-2">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function QueryError({ label }: { label: string }) {
  return (
    <p className="text-xs text-rose-600">
      Impossible de charger {label}. Réessayez dans un instant.
    </p>
  );
}

export default function LogistiquePage() {
  const { token } = useAuth();
  const queryOptions = { staleTime: 30_000, retry: 1 };

  const stocks = useQuery<CentralWarehouse[]>({
    queryKey: ["logistique", "stocks"],
    queryFn: () => apiFetch("/api/stocks/entrepots", token),
    ...queryOptions,
  });
  const stockAlerts = useQuery<CentralWarehouse[]>({
    queryKey: ["logistique", "stock-alertes"],
    queryFn: () => apiFetch("/api/stocks/alertes", token),
    ...queryOptions,
  });
  const delegated = useQuery<DelegatedWarehouseStats>({
    queryKey: ["logistique", "entrepots-delegues"],
    queryFn: () => apiFetch("/api/entrepots/stats", token),
    ...queryOptions,
  });
  const sacherie = useQuery<SacherieResume>({
    queryKey: ["logistique", "sacherie-resume"],
    queryFn: () => apiFetch("/api/sacherie/resume", token),
    ...queryOptions,
  });
  const sacTypes = useQuery<SacType[]>({
    queryKey: ["logistique", "sacherie-types"],
    queryFn: () => apiFetch("/api/sacherie/types", token),
    ...queryOptions,
  });
  const expeditions = useQuery<ExpeditionStats>({
    queryKey: ["logistique", "expeditions"],
    queryFn: () => apiFetch("/api/expeditions/stats", token),
    ...queryOptions,
  });
  const missions = useQuery<{ missions: TransportMission[] }>({
    queryKey: ["logistique", "transport-missions"],
    queryFn: () => apiFetch("/api/transport/missions", token),
    ...queryOptions,
  });

  const centralStockKg = (stocks.data ?? []).reduce((total, item) => total + numberValue(item.stockActuelKg), 0);
  const activeTransportMissions = (missions.data?.missions ?? []).filter(({ mission }) =>
    mission?.statut != null && !["terminee", "annulee", "annulée"].includes(mission.statut),
  ).length;
  const urgentAlerts = (stockAlerts.data?.length ?? 0) + (sacherie.data?.alertes ?? 0) + (delegated.data?.alertesCapacite ?? 0);
  const sacherieAlerts = (sacTypes.data ?? []).filter((type) => type.enAlerte);
  const isRefreshing = [stocks, stockAlerts, delegated, sacherie, sacTypes, expeditions, missions].some((query) => query.isFetching);
  const refreshAll = () => [stocks, stockAlerts, delegated, sacherie, sacTypes, expeditions, missions].forEach((query) => void query.refetch());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Poste de pilotage
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Logistique</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Une vue transversale des stocks, des entrepôts, des flux de transport et des expéditions.
          </p>
        </div>
        <Button variant="secondary" onClick={refreshAll} disabled={isRefreshing} className="gap-2 self-start sm:self-auto">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {urgentAlerts > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">{formatCount(urgentAlerts)} alerte{urgentAlerts > 1 ? "s" : ""} à vérifier</p>
            <p className="mt-0.5 text-xs text-amber-800">Stock central, sacherie ou capacité d’entrepôt sous surveillance.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Stock central"
          value={stocks.isLoading ? <LoadingValue /> : formatKg(centralStockKg)}
          caption={`${formatCount(stocks.data?.length)} entrepôt${(stocks.data?.length ?? 0) > 1 ? "s" : ""} suivi${(stocks.data?.length ?? 0) > 1 ? "s" : ""}`}
          icon={Boxes}
          tone="green"
        />
        <MetricCard
          label="Entrepôts délégués"
          value={delegated.isLoading ? <LoadingValue /> : formatKg(delegated.data?.stockTotalEntrepotsKg)}
          caption={`${formatCount(delegated.data?.transfertsEnCours)} transfert${(delegated.data?.transfertsEnCours ?? 0) > 1 ? "s" : ""} en cours`}
          icon={Warehouse}
          tone="amber"
        />
        <MetricCard
          label="Sacherie disponible"
          value={sacherie.isLoading ? <LoadingValue /> : `${formatCount(sacherie.data?.stockDisponible)} sacs`}
          caption={`${formatCount(sacherie.data?.sacsDetenus)} sacs détenus par les délégués`}
          icon={PackageCheck}
          tone="blue"
        />
        <MetricCard
          label="Flux à surveiller"
          value={expeditions.isLoading ? <LoadingValue /> : formatCount((expeditions.data?.litiges ?? 0) + (expeditions.data?.enCours ?? 0))}
          caption={`${formatCount(expeditions.data?.litiges)} litige${(expeditions.data?.litiges ?? 0) > 1 ? "s" : ""} · ${formatCount(activeTransportMissions)} mission${activeTransportMissions > 1 ? "s" : ""}`}
          icon={Truck}
          tone={((expeditions.data?.litiges ?? 0) > 0) ? "rose" : "blue"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Warehouse className="h-4 w-4 text-emerald-700" />Stocks et entrepôts</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Capacité et niveaux disponibles par site.</p>
            </div>
            <Link href="/stocks"><Button variant="ghost" size="sm" className="gap-1 text-xs">Voir les stocks <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </CardHeader>
          <CardContent>
            {stocks.isError && <QueryError label="les stocks centraux" />}
            {!stocks.isLoading && !stocks.isError && (stocks.data ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Aucun entrepôt central configuré.</p>
            )}
            <div className="space-y-3">
              {(stocks.data ?? []).slice(0, 5).map((warehouse) => {
                const capacity = numberValue(warehouse.capaciteKg);
                const stock = numberValue(warehouse.stockActuelKg);
                const percentage = capacity > 0 ? Math.min(100, Math.round((stock / capacity) * 100)) : 0;
                return (
                  <div key={warehouse.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{warehouse.nom}</p>
                        <p className="text-xs text-slate-500">{warehouse.ville}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{formatKg(stock)}</p>
                        <p className="text-xs text-slate-500">{capacity > 0 ? `${percentage}% capacité` : "capacité non renseignée"}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${warehouse.enAlerte ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {stockAlerts.data && stockAlerts.data.length > 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {formatCount(stockAlerts.data.length)} entrepôt{stockAlerts.data.length > 1 ? "s" : ""} sous le seuil d’alerte.
              </div>
            )}
            {stockAlerts.isError && <div className="mt-3"><QueryError label="les alertes de stock" /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4 text-blue-700" />Sacherie</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Disponibilité des sacs et seuils minimum.</p>
            </div>
            <Link href="/sacherie"><Button variant="ghost" size="sm" className="gap-1 text-xs">Ouvrir <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </CardHeader>
          <CardContent>
            {sacherie.isError || sacTypes.isError ? <QueryError label="la sacherie" /> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3"><p className="text-2xl font-bold text-blue-800">{formatCount(sacherie.data?.stockDisponible)}</p><p className="text-xs text-blue-700">sacs au central</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{formatCount(sacherie.data?.typesActifs)}</p><p className="text-xs text-slate-500">types actifs</p></div>
                </div>
                <div className="mt-4 space-y-2">
                  {sacherieAlerts.length === 0 ? (
                    <p className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Tous les types sont au-dessus du seuil.</p>
                  ) : sacherieAlerts.slice(0, 3).map((type) => (
                    <div key={type.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs">
                      <span className="font-medium text-rose-900">{type.nom}</span>
                      <Badge variant="destructive">{formatCount(type.stockDisponible)} / {formatCount(type.stockMinimum)}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-amber-600" />Transferts délégués</CardTitle></CardHeader>
          <CardContent>
            {delegated.isError ? <QueryError label="les entrepôts délégués" /> : (
              <>
                <p className="text-3xl font-bold text-slate-900">{formatCount(delegated.data?.transfertsEnCours)}</p>
                <p className="mt-1 text-sm text-slate-500">transfert{(delegated.data?.transfertsEnCours ?? 0) > 1 ? "s" : ""} en attente de suivi</p>
                <Link href="/entrepots"><Button variant="outline" size="sm" className="mt-4 gap-2">Suivre les entrepôts <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-slate-700" />Transport opérationnel</CardTitle></CardHeader>
          <CardContent>
            {missions.isError ? <QueryError label="les missions de transport" /> : (
              <>
                <p className="text-3xl font-bold text-slate-900">{formatCount(activeTransportMissions)}</p>
                <p className="mt-1 text-sm text-slate-500">mission{activeTransportMissions > 1 ? "s" : ""} active{activeTransportMissions > 1 ? "s" : ""}</p>
                <Link href="/transport"><Button variant="outline" size="sm" className="mt-4 gap-2">Voir le transport <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Ship className="h-4 w-4 text-purple-700" />Expéditions port</CardTitle></CardHeader>
          <CardContent>
            {expeditions.isError ? <QueryError label="les expéditions" /> : (
              <>
                <div className="flex items-end gap-4">
                  <div><p className="text-3xl font-bold text-slate-900">{formatCount(expeditions.data?.enCours)}</p><p className="text-xs text-slate-500">en cours</p></div>
                  <div><p className="text-2xl font-bold text-rose-600">{formatCount(expeditions.data?.litiges)}</p><p className="text-xs text-slate-500">litiges</p></div>
                </div>
                <Link href="/expeditions"><Button variant="outline" size="sm" className="mt-4 gap-2">Suivre les expéditions <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}