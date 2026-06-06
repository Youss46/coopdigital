import { useEffect, useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { fetchDashboard, formatFcfa, formatDate, type DashboardM15 } from "@/lib/api";
import {
  Building2, Users, AlertTriangle, TrendingUp, Clock, CheckCircle2,
  PauseCircle, XCircle, Loader2, Plus, RefreshCw,
} from "lucide-react";

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; sub?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-5 flex items-start gap-4">
      <div className={`size-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardM15 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setData(await fetchDashboard()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Tableau de bord</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Vue d'ensemble des coopératives et licences</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted transition-colors">
              <RefreshCw size={14} /> Actualiser
            </button>
            <Link href="/cooperatives/nouvelle">
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus size={14} /> Nouvelle coop
              </button>
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={24} className="animate-spin mr-3" /> Chargement…
          </div>
        )}
        {error && <div className="text-destructive bg-destructive/10 rounded-lg p-4 text-sm">{error}</div>}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KpiCard label="Coops actives" value={data.actives} icon={CheckCircle2} color="bg-green-100 text-green-700" />
              <KpiCard label="En trial" value={data.trials} icon={Clock} color="bg-yellow-100 text-yellow-700" />
              <KpiCard label="Suspendues" value={data.suspendues} icon={PauseCircle} color="bg-red-100 text-red-700" />
              <KpiCard label="Expirées" value={data.expirees} icon={XCircle} color="bg-gray-200 text-gray-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <KpiCard label="Revenus totaux licences" value={formatFcfa(data.revenus)} icon={TrendingUp} color="bg-primary/10 text-primary" />
              <KpiCard label="Total membres gérés" value={data.totalMembres.toLocaleString("fr-FR")} icon={Users} color="bg-blue-100 text-blue-700" />
              <KpiCard label="Expirations dans 30 j" value={data.expirantDans30j} icon={AlertTriangle} color="bg-orange-100 text-orange-700" sub="licences à renouveler" />
            </div>

            {data.expirations.length > 0 && (
              <div className="bg-card border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-500" />
                    Expirations imminentes
                  </h2>
                  <Link href="/licences">
                    <span className="text-xs text-primary hover:underline cursor-pointer">Voir toutes les licences →</span>
                  </Link>
                </div>
                <div className="divide-y">
                  {data.expirations.slice(0, 8).map((e) => {
                    const jours = Math.ceil((new Date(e.dateExpiration).getTime() - Date.now()) / 86400000);
                    return (
                      <Link key={e.id} href={`/cooperatives/${e.cooperativeId}`}>
                        <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 cursor-pointer transition-colors">
                          <div>
                            <div className="text-sm font-medium">Coop #{e.cooperativeId}</div>
                            <div className="text-xs text-muted-foreground">{e.planNom ?? "—"} · expire le {formatDate(e.dateExpiration)}</div>
                          </div>
                          <div className={`text-sm font-semibold ${jours <= 0 ? "text-red-600" : jours <= 30 ? "text-orange-500" : "text-green-600"}`}>
                            {jours <= 0 ? "Expirée" : `J-${jours}`}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {data.expirations.length === 0 && (
              <div className="bg-card border border-green-200 rounded-xl p-6 text-center">
                <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                <div className="font-medium text-green-800">Aucune expiration dans les 30 prochains jours</div>
                <div className="text-sm text-green-600 mt-1">Toutes les licences sont à jour.</div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
