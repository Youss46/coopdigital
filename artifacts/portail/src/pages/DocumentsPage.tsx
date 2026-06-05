import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, type Livraison } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, ArrowLeft, Download, FileText, CreditCard } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");

export default function DocumentsPage() {
  const [, setLoc] = useLocation();
  const { profil } = useAuth();
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.livraisons().then(setLivraisons).finally(() => setLoading(false));
  }, []);

  const sixMoisAvant = new Date();
  sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);
  const recents = livraisons.filter(l => new Date(l.dateLivraison) >= sixMoisAvant);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-green-700 px-5 pt-8 pb-6">
        <button onClick={() => setLoc("/")} className="flex items-center gap-2 text-green-200 mb-4">
          <ArrowLeft className="w-5 h-5" /> Retour
        </button>
        <h1 className="text-2xl font-bold text-white">📄 Mes documents</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Carte de membre */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Carte de membre</h2>
              <p className="text-sm text-gray-500">{profil?.codeMembre}</p>
            </div>
          </div>
          <a
            href={api.carteMembreUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700
              text-white font-bold text-base rounded-2xl py-4 transition-colors w-full"
          >
            <Download className="w-5 h-5" /> Télécharger (PDF)
          </a>
        </div>

        {/* Reçus de livraison */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Reçus de paiement</h2>
              <p className="text-sm text-gray-500">6 derniers mois</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
          ) : recents.length === 0 ? (
            <p className="text-gray-400 text-center py-6 text-base">Aucun reçu disponible</p>
          ) : (
            <div className="space-y-3">
              {recents.map(l => (
                <div key={l.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <div className="text-base font-semibold text-gray-800">
                      {fmtDate(l.dateLivraison)} — {fmt(l.poidsKg)} kg
                    </div>
                    <div className="text-sm text-gray-500">
                      Net reçu : <span className="font-bold text-green-700">{fmt(l.montantNetFcfa)} FCFA</span>
                    </div>
                    {l.codeAchat && <div className="text-xs text-gray-400 font-mono">{l.codeAchat}</div>}
                  </div>
                  <a
                    href={api.recuPdfUrl(l.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50
                      rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-700 shrink-0 ml-3"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
