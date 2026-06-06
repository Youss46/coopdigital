import { useEffect, useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { fetchCooperatives, formatDate, statutColor, joursColor, type CoopItem } from "@/lib/api";
import { FileKey, Loader2, RefreshCw, AlertTriangle, Search, ChevronRight } from "lucide-react";

export default function Licences() {
  const [coops, setCoops] = useState<CoopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<string>("tous");

  async function load() {
    setLoading(true); setError("");
    try { setCoops(await fetchCooperatives()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = coops
    .filter((c) => {
      if (filtre === "tous") return true;
      return c.licence?.statut === filtre;
    })
    .filter((c) =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.licence?.cleLicence.toLowerCase().includes(search.toLowerCase())
    );

  const stats = {
    active: coops.filter((c) => c.licence?.statut === "active").length,
    trial: coops.filter((c) => c.licence?.statut === "trial").length,
    suspendue: coops.filter((c) => c.licence?.statut === "suspendue").length,
    expiree: coops.filter((c) => c.licence?.statut === "expiree").length,
    expirant30: coops.filter((c) => c.joursRestants !== null && c.joursRestants >= 0 && c.joursRestants <= 30).length,
  };

  const filtres = [
    { id: "tous", label: "Toutes", count: coops.length },
    { id: "active", label: "Actives", count: stats.active },
    { id: "trial", label: "Trial", count: stats.trial },
    { id: "suspendue", label: "Suspendues", count: stats.suspendue },
    { id: "expiree", label: "Expirées", count: stats.expiree },
  ];

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Licences</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Gestion et suivi de toutes les licences</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted">
            <RefreshCw size={14} />
          </button>
        </div>

        {stats.expirant30 > 0 && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-5 text-sm text-orange-800">
            <AlertTriangle size={16} className="shrink-0 text-orange-500" />
            <span>{stats.expirant30} licence{stats.expirant30 > 1 ? "s" : ""} expire{stats.expirant30 > 1 ? "nt" : ""} dans les 30 prochains jours</span>
          </div>
        )}

        <div className="flex gap-2 mb-5 flex-wrap">
          {filtres.map((f) => (
            <button key={f.id} onClick={() => setFiltre(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${filtre === f.id ? "bg-primary text-white border-primary" : "bg-card hover:bg-muted border-border"}`}>
              {f.label} <span className="ml-1 opacity-70 text-xs">({f.count})</span>
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou clé de licence…"
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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
                <FileKey size={32} className="mx-auto mb-3 opacity-30" />
                <div className="font-medium">Aucune licence trouvée</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Coopérative</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Clé</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiration</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Auto</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => (
                    <Link key={c.id} href={`/cooperatives/${c.id}`}>
                      <tr className="hover:bg-muted/30 cursor-pointer transition-colors">
                        <td className="px-5 py-3.5 font-medium">{c.nom}</td>
                        <td className="px-4 py-3.5">
                          {c.licence ? (
                            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{c.licence.cleLicence}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">{c.licence?.planNom ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          {c.licence ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statutColor(c.licence.statut)}`}>
                              {c.licence.statut}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs text-muted-foreground">{formatDate(c.licence?.dateExpiration)}</div>
                          {c.joursRestants !== null && (
                            <div className={`text-xs font-medium ${joursColor(c.joursRestants)}`}>
                              {c.joursRestants <= 0 ? "Expirée" : `J-${c.joursRestants}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs ${c.licence?.renouvellementAuto ? "text-green-600" : "text-muted-foreground"}`}>
                            {c.licence?.renouvellementAuto ? "✓ Oui" : "Non"}
                          </span>
                        </td>
                        <td className="pr-4"><ChevronRight size={15} className="text-muted-foreground" /></td>
                      </tr>
                    </Link>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
