import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, getToken, type Livraison } from "@/lib/api";
import { Loader2, ArrowLeft, Download, Package, Printer } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function LivraisonsPage() {
  const [, setLoc] = useLocation();
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);

  useEffect(() => {
    api.livraisons().then(setLivraisons).finally(() => setLoading(false));
  }, []);

  async function fetchBlob(livraison: Livraison): Promise<Blob | null> {
    const token = getToken();
    const res = await fetch(api.recuPdfUrl(livraison.id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
    }
    return res.blob();
  }

  async function telechargerRecu(livraison: Livraison) {
    if (downloadingId !== null) return;
    setDownloadingId(livraison.id);
    try {
      const blob = await fetchBlob(livraison);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recu-${livraison.codeAchat ?? `LIV-${livraison.id}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message ?? "Impossible de télécharger le reçu");
    } finally {
      setDownloadingId(null);
    }
  }

  async function imprimerRecu(livraison: Livraison) {
    if (printingId !== null) return;
    setPrintingId(livraison.id);
    try {
      const blob = await fetchBlob(livraison);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) win.addEventListener("load", () => { win.print(); });
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      alert((err as Error).message ?? "Impossible d'imprimer le reçu");
    } finally {
      setPrintingId(null);
    }
  }

  const totalKg = livraisons.reduce((s, l) => s + Number(l.poidsKg), 0);
  const totalNet = livraisons.reduce((s, l) => s + l.montantNetFcfa, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-700 px-5 pt-8 pb-6">
        <button onClick={() => setLoc("/")} className="flex items-center gap-2 text-green-200 mb-4">
          <ArrowLeft className="w-5 h-5" /> Retour
        </button>
        <h1 className="text-2xl font-bold text-white">📦 Mes livraisons</h1>
        {!loading && (
          <div className="flex gap-6 mt-4">
            <div>
              <div className="text-2xl font-black text-white">{fmt(totalKg)} kg</div>
              <div className="text-green-300 text-sm">tonnage total</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">{fmt(totalNet)} FCFA</div>
              <div className="text-green-300 text-sm">net reçu</div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
        ) : livraisons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Aucune livraison enregistrée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {livraisons.map(l => (
              <div key={l.id} className="bg-white rounded-3xl shadow-sm p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-base font-semibold text-gray-800">{fmtDate(l.dateLivraison)}</div>
                    <div className="text-sm text-gray-400">{l.codeAchat ?? `LIV-${l.id}`}</div>
                    {l.campagneLibelle && (
                      <div className="text-xs text-green-600 font-medium mt-1">{l.campagneLibelle}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => telechargerRecu(l)}
                      disabled={downloadingId === l.id || printingId === l.id}
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 rounded-2xl px-3 py-2 text-sm font-medium text-gray-700"
                      title="Télécharger le reçu PDF"
                    >
                      {downloadingId === l.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Download className="w-4 h-4" />}
                      <span className="hidden sm:inline">Télécharger</span>
                    </button>
                    <button
                      onClick={() => imprimerRecu(l)}
                      disabled={downloadingId === l.id || printingId === l.id}
                      className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 disabled:opacity-60 rounded-2xl px-3 py-2 text-sm font-medium text-green-700"
                      title="Imprimer le reçu"
                    >
                      {printingId === l.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Printer className="w-4 h-4" />}
                      Imprimer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Poids net</div>
                    <div className="text-lg font-black text-gray-900">{fmt(l.poidsKg)} kg</div>
                    <div className="text-xs text-gray-500">{fmt(l.prixUnitaireFcfa)} FCFA/kg</div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Montant brut</div>
                    <div className="text-base font-bold text-gray-800">{fmt(l.montantBrutFcfa)} FCFA</div>
                  </div>
                </div>

                {(l.avanceDeduiteFcfa > 0 || l.intrantsDeduitsFcfa > 0) && (
                  <div className="mt-3 space-y-1">
                    {l.avanceDeduiteFcfa > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600">— Avance déduite</span>
                        <span className="font-medium text-orange-700">-{fmt(l.avanceDeduiteFcfa)} FCFA</span>
                      </div>
                    )}
                    {l.intrantsDeduitsFcfa > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600">— Intrants déduits</span>
                        <span className="font-medium text-orange-700">-{fmt(l.intrantsDeduitsFcfa)} FCFA</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 bg-green-600 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-white font-semibold text-base">NET REÇU</span>
                  <span className="text-white font-black text-xl">{fmt(l.montantNetFcfa)} FCFA</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
