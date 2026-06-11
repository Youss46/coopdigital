import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, type PartsSociales } from "@/lib/api";
import { Loader2, ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

export default function PartsSocialesPage() {
  const [, setLoc] = useLocation();
  const [parts, setParts] = useState<PartsSociales | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.partsSociales().then(setParts).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-green-700 px-5 pt-8 pb-6">
        <button onClick={() => setLoc("/")} className="flex items-center gap-2 text-green-200 mb-4">
          <ArrowLeft className="w-5 h-5" /> Retour
        </button>
        <h1 className="text-2xl font-bold text-white">🌱 Mes parts sociales</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
        ) : !parts ? (
          <div className="text-center py-16 text-gray-400 text-lg">Aucune donnée disponible</div>
        ) : (
          <>
            {/* Résumé */}
            <div className="bg-white rounded-3xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-5">Résumé</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-black text-green-700">{parts.nbrePartsSouscrites}</div>
                  <div className="text-sm text-green-600 mt-1">parts souscrites</div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-black text-gray-900">{fmt(parts.valeurNominaleFcfa)}</div>
                  <div className="text-sm text-gray-500 mt-1">FCFA/part</div>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-base text-gray-600">Total souscrit</span>
                  <span className="text-base font-bold text-gray-900">{fmt(parts.totalSouscritFcfa)} FCFA</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-base text-gray-600">Total libéré</span>
                  <span className="text-base font-bold text-green-700">{fmt(parts.totalLibereFcfa)} FCFA</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-base text-gray-600">Reste à libérer</span>
                  <span className="text-base font-bold text-orange-600">{fmt(parts.resteALibererFcfa)} FCFA</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">Progression libération</span>
                  <span className="font-bold text-green-700">{parts.pctLibere}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5">
                  <div
                    className="bg-green-600 h-5 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{ width: `${Math.min(parts.pctLibere, 100)}%` }}
                  >
                    {parts.pctLibere > 20 && (
                      <span className="text-white text-xs font-bold">{parts.pctLibere}%</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Historique versements */}
            {parts.historiqueVersements.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Historique des versements</h2>
                <div className="space-y-3">
                  {parts.historiqueVersements.map(v => (
                    <div key={v.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-base font-semibold text-gray-800">{fmtDate(v.dateVersement)}</div>
                        {v.codeLiberation && (
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{v.codeLiberation}</div>
                        )}
                      </div>
                      <div className="text-base font-bold text-green-700">{fmt(v.montantFcfa)} FCFA</div>
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
