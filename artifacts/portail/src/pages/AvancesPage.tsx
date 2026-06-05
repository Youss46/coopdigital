import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, type Avance } from "@/lib/api";
import { Loader2, ArrowLeft, Wallet } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

function StatutBadge({ statut }: { statut: string }) {
  const cfg: Record<string, string> = {
    en_cours: "bg-blue-100 text-blue-700",
    rembourse: "bg-green-100 text-green-700",
    en_retard: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    en_cours: "En cours",
    rembourse: "Remboursée",
    en_retard: "En retard",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cfg[statut] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[statut] ?? statut}
    </span>
  );
}

export default function AvancesPage() {
  const [, setLoc] = useLocation();
  const [avances, setAvances] = useState<Avance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.avances().then(setAvances).finally(() => setLoading(false));
  }, []);

  const enCours = avances.filter(a => a.statut !== "rembourse");
  const historique = avances.filter(a => a.statut === "rembourse");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-green-700 px-5 pt-8 pb-6">
        <button onClick={() => setLoc("/")} className="flex items-center gap-2 text-green-200 mb-4">
          <ArrowLeft className="w-5 h-5" /> Retour
        </button>
        <h1 className="text-2xl font-bold text-white">💰 Mes avances</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
        ) : avances.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wallet className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Aucune avance enregistrée</p>
          </div>
        ) : (
          <>
            {enCours.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">Avances en cours</h2>
                <div className="space-y-4">
                  {enCours.map(a => (
                    <div key={a.id} className="bg-white rounded-3xl shadow-sm p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-base text-gray-500">Accordé le {fmtDate(a.dateOctroi)}</div>
                          {a.motif && <div className="text-sm text-gray-400 mt-0.5">{a.motif}</div>}
                        </div>
                        <StatutBadge statut={a.statut} />
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="bg-gray-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">Accordé</div>
                          <div className="text-base font-black text-gray-900">{fmt(a.montantOctroyeFcfa)}</div>
                          <div className="text-xs text-gray-400">FCFA</div>
                        </div>
                        <div className="bg-green-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">Remboursé</div>
                          <div className="text-base font-black text-green-700">{fmt(a.montantRembourseFcfa)}</div>
                          <div className="text-xs text-gray-400">FCFA</div>
                        </div>
                        <div className="bg-red-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">Reste dû</div>
                          <div className="text-base font-black text-red-700">{fmt(a.soldeRestantFcfa)}</div>
                          <div className="text-xs text-gray-400">FCFA</div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-600 font-medium">Progression du remboursement</span>
                          <span className="font-bold text-green-700">{a.pctRembourse}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4">
                          <div
                            className="bg-green-600 h-4 rounded-full transition-all"
                            style={{ width: `${Math.min(a.pctRembourse, 100)}%` }}
                          />
                        </div>
                      </div>

                      {a.dateEcheance && (
                        <div className="mt-4 flex items-center justify-between text-sm bg-amber-50 rounded-2xl px-4 py-3">
                          <span className="text-amber-700">Échéance</span>
                          <span className="font-bold text-amber-800">{fmtDate(a.dateEcheance)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {historique.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">Historique remboursé</h2>
                <div className="space-y-3">
                  {historique.map(a => (
                    <div key={a.id} className="bg-white rounded-3xl shadow-sm p-5 flex justify-between items-center">
                      <div>
                        <div className="text-base font-semibold text-gray-800">{fmt(a.montantOctroyeFcfa)} FCFA</div>
                        <div className="text-sm text-gray-500">{fmtDate(a.dateOctroi)}</div>
                        {a.motif && <div className="text-xs text-gray-400">{a.motif}</div>}
                      </div>
                      <StatutBadge statut={a.statut} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
