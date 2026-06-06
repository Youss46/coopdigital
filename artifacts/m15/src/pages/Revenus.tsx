import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { fetchCooperatives, fetchPlans, formatFcfa, type CoopItem, type Plan } from "@/lib/api";
import { TrendingUp, Loader2, RefreshCw, CreditCard, BarChart3 } from "lucide-react";

interface RevenuLigne {
  coop: CoopItem;
  plan: Plan | undefined;
  montantAnnuel: number;
  duree: number;
  montantTotal: number;
}

export default function Revenus() {
  const [coops, setCoops] = useState<CoopItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [cs, ps] = await Promise.all([fetchCooperatives(), fetchPlans()]);
      setCoops(cs); setPlans(ps);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const lignes: RevenuLigne[] = coops
    .filter((c) => c.licence && (c.licence.statut === "active" || c.licence.statut === "trial"))
    .map((c) => {
      const plan = plans.find((p) => p.nom === c.licence?.planNom);
      const duree = c.licence?.dureeAns ?? 1;
      const montantAnnuel = plan ? parseInt(plan.prix1anFcfa) : 0;
      return { coop: c, plan, montantAnnuel, duree, montantTotal: montantAnnuel * duree };
    });

  const totalRevenuAnnuel = lignes.reduce((sum, l) => sum + l.montantAnnuel, 0);
  const totalRevenuContrats = lignes.reduce((sum, l) => sum + l.montantTotal, 0);

  const parPlan = plans.map((p) => {
    const count = lignes.filter((l) => l.plan?.id === p.id).length;
    const revenu = lignes.filter((l) => l.plan?.id === p.id).reduce((s, l) => s + l.montantAnnuel, 0);
    return { plan: p, count, revenu };
  }).filter((x) => x.count > 0);

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Revenus</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Analyse financière des licences actives</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={24} className="animate-spin mr-3" /> Chargement…
          </div>
        )}
        {error && <div className="text-destructive bg-destructive/10 rounded-lg p-4 text-sm">{error}</div>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
                <div className="size-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{formatFcfa(totalRevenuAnnuel)}</div>
                  <div className="text-sm text-muted-foreground">Revenu annuel récurrent</div>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
                <div className="size-11 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <CreditCard size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{formatFcfa(totalRevenuContrats)}</div>
                  <div className="text-sm text-muted-foreground">Total contrats en cours</div>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
                <div className="size-11 rounded-lg bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{lignes.length}</div>
                  <div className="text-sm text-muted-foreground">Contrats actifs</div>
                </div>
              </div>
            </div>

            {parPlan.length > 0 && (
              <div className="bg-card border rounded-xl p-5 mb-6">
                <h2 className="font-semibold mb-4">Répartition par plan</h2>
                <div className="space-y-3">
                  {parPlan.map(({ plan, count, revenu }) => {
                    const pct = totalRevenuAnnuel > 0 ? Math.round((revenu / totalRevenuAnnuel) * 100) : 0;
                    return (
                      <div key={plan.id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">{plan.nom}</span>
                          <div className="flex gap-4 text-muted-foreground text-xs">
                            <span>{count} coop{count > 1 ? "s" : ""}</span>
                            <span className="font-semibold text-foreground">{formatFcfa(revenu)}</span>
                            <span>{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold">Détail par coopérative</h2>
              </div>
              {lignes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
                  <div>Aucun contrat actif</div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Coopérative</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Durée</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Annuel</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total contrat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lignes.map(({ coop, plan, montantAnnuel, duree, montantTotal }) => (
                      <tr key={coop.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 font-medium">{coop.nom}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{plan?.nom ?? "—"}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{duree} an{duree > 1 ? "s" : ""}</td>
                        <td className="px-4 py-3.5 text-right">{formatFcfa(montantAnnuel)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-primary">{formatFcfa(montantTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t-2">
                      <td colSpan={3} className="px-5 py-3 font-bold text-sm">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-sm">{formatFcfa(totalRevenuAnnuel)}</td>
                      <td className="px-5 py-3 text-right font-bold text-sm text-primary">{formatFcfa(totalRevenuContrats)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
