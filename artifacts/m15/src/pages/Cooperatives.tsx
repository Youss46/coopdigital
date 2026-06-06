import { useEffect, useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { fetchCooperatives, formatDate, statutColor, joursColor, type CoopItem } from "@/lib/api";
import { Building2, Plus, Search, Loader2, RefreshCw, ChevronRight } from "lucide-react";

function CoopCard({ c }: { c: CoopItem }) {
  return (
    <Link href={`/cooperatives/${c.id}`}>
      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 cursor-pointer transition-colors border-b last:border-0">
        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
          {c.nom.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{c.nom}</div>
          <div className="text-xs text-muted-foreground">{c.ville}, {c.region} · {c.nbMembres} membres</div>
          <div className="flex items-center gap-2 mt-1">
            {c.licence ? (
              <>
                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${statutColor(c.licence.statut)}`}>
                  {c.licence.statut}
                </span>
                <span className="text-xs text-muted-foreground">{c.licence.planNom ?? "—"}</span>
                {c.joursRestants !== null && (
                  <span className={`text-xs font-medium ${joursColor(c.joursRestants)}`}>
                    {c.joursRestants <= 0 ? "Expirée" : `J-${c.joursRestants}`}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sans licence</span>
            )}
          </div>
        </div>
        <ChevronRight size={15} className="text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

export default function Cooperatives() {
  const [coops, setCoops] = useState<CoopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setCoops(await fetchCooperatives()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = coops.filter((c) =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    c.ville.toLowerCase().includes(search.toLowerCase()) ||
    c.region.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Coopératives</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {coops.length} coopérative{coops.length > 1 ? "s" : ""} enregistrée{coops.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted transition-colors">
              <RefreshCw size={14} />
            </button>
            <Link href="/cooperatives/nouvelle">
              <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                <Plus size={14} />
                <span className="hidden sm:inline">Nouvelle coopérative</span>
                <span className="sm:hidden">Nouvelle</span>
              </button>
            </Link>
          </div>
        </div>

        {/* Recherche */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ville, région…"
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={24} className="animate-spin mr-3" /> Chargement…
          </div>
        )}
        {error && <div className="text-destructive bg-destructive/10 rounded-lg p-4 text-sm">{error}</div>}

        {!loading && !error && (
          <div className="bg-card border rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                <div className="font-medium">Aucune coopérative trouvée</div>
              </div>
            ) : (
              <>
                {/* Vue carte — mobile */}
                <div className="sm:hidden divide-y">
                  {filtered.map((c) => <CoopCard key={c.id} c={c} />)}
                </div>

                {/* Vue table — desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b">
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Coopérative</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Localisation</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiration</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membres</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map((c) => (
                        <Link key={c.id} href={`/cooperatives/${c.id}`}>
                          <tr className="hover:bg-muted/30 cursor-pointer transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="font-medium">{c.nom}</div>
                              <div className="text-xs text-muted-foreground">ID #{c.id}</div>
                            </td>
                            <td className="px-4 py-3.5 text-muted-foreground">{c.ville}, {c.region}</td>
                            <td className="px-4 py-3.5">{c.licence?.planNom ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-4 py-3.5">
                              {c.licence ? (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statutColor(c.licence.statut)}`}>
                                  {c.licence.statut}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">Sans licence</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="text-xs text-muted-foreground">{formatDate(c.licence?.dateExpiration)}</div>
                              {c.joursRestants !== null && (
                                <div className={`text-xs font-medium ${joursColor(c.joursRestants)}`}>
                                  {c.joursRestants <= 0 ? "Expirée" : `J-${c.joursRestants}`}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-muted-foreground">{c.nbMembres}</td>
                            <td className="pr-4"><ChevronRight size={15} className="text-muted-foreground" /></td>
                          </tr>
                        </Link>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
