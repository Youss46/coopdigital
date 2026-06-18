import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, XCircle, Loader2, Package, Leaf, MapPin, Scale } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface LotPublic {
  id: number;
  qrCodeLot: string;
  statut: string;
  statutLabel: string;
  poidsTotalKg: string;
  nombreSacs: number | null;
  entrepot: string | null;
  dateCreation: string;
  cooperative: { nom: string | null; ville: string | null };
  producteurs: Array<{
    nom: string;
    village: string | null;
    poidsKg: string | null;
  }>;
}

export default function LotPublicPage() {
  const { qrCode } = useParams<{ qrCode: string }>();
  const [data, setData] = useState<LotPublic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!qrCode) return;
    fetch(`${BASE}/api/portail/lots/${encodeURIComponent(qrCode)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { erreur?: string }).erreur ?? "Lot introuvable");
        }
        return r.json() as Promise<LotPublic>;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [qrCode]);

  const formatPoids = (kg: string | null | undefined) => {
    if (!kg) return "—";
    const n = parseFloat(kg);
    return isNaN(n) ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 to-amber-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-3">
            <Leaf className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white font-bold text-xl">Traçabilité du lot</h1>
          <p className="text-amber-200 text-sm mt-1">CoopDigital — Cacao de Côte d'Ivoire</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
              <p className="text-sm text-gray-500">Chargement en cours…</p>
            </div>
          ) : erreur ? (
            <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Lot introuvable</p>
                <p className="text-sm text-gray-500 mt-1">{erreur}</p>
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 font-mono break-all">{qrCode}</p>
            </div>
          ) : data ? (
            <div>
              <div className="px-5 py-3 flex items-center gap-2 bg-amber-600">
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span className="text-white font-semibold text-sm">{data.statutLabel}</span>
              </div>

              <div className="bg-amber-50 px-5 py-2 border-b border-amber-100">
                <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">{data.cooperative.nom ?? "Coopérative"}</p>
                <p className="text-xs text-amber-600">{data.cooperative.ville ?? ""}</p>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Scale className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Poids</p>
                    </div>
                    <p className="text-base font-bold text-gray-900">{formatPoids(data.poidsTotalKg)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Package className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Sacs</p>
                    </div>
                    <p className="text-base font-bold text-gray-900">{data.nombreSacs ?? "—"}</p>
                  </div>
                </div>

                {data.entrepot && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-400">Entrepôt</p>
                      <p className="text-sm font-medium text-gray-700">{data.entrepot}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400">Date de création</p>
                  <p className="text-sm font-medium text-gray-700">{formatDate(data.dateCreation)}</p>
                </div>

                {data.producteurs.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Producteurs</p>
                    <div className="space-y-2">
                      {data.producteurs.map((p, i) => (
                        <div key={i} className="bg-green-50 rounded-lg px-3 py-2">
                          <p className="text-sm font-medium text-green-900">{p.nom || "—"}</p>
                          {p.village && (
                            <p className="text-xs text-green-600 mt-0.5">{p.village}</p>
                          )}
                          {p.poidsKg && (
                            <p className="text-xs text-gray-500">{formatPoids(p.poidsKg)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-300 text-center font-mono break-all">{data.qrCodeLot}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
