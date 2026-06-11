import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface MembrePublic {
  nom: string;
  prenoms: string;
  coopNom: string;
  coopVille: string;
  statut: string;
  village: string | null;
  superficieHa: string | null;
  dateAdhesion: string;
  codeMembre: string;
}

export default function VerifierPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<MembrePublic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    fetch(`${BASE}/api/portail/verifier/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { erreur?: string }).erreur ?? "Membre introuvable");
        }
        return r.json() as Promise<MembrePublic>;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white font-bold text-xl">Vérification de carte</h1>
          <p className="text-green-200 text-sm mt-1">CoopDigital — Système coopératif</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              <p className="text-sm text-gray-500">Vérification en cours…</p>
            </div>
          ) : erreur ? (
            <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Carte non reconnue</p>
                <p className="text-sm text-gray-500 mt-1">{erreur}</p>
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 font-mono break-all">{code}</p>
            </div>
          ) : data ? (
            <div>
              {/* Bandeau statut */}
              <div className={`px-5 py-3 flex items-center gap-2 ${data.statut === "actif" ? "bg-green-600" : "bg-red-500"}`}>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span className="text-white font-semibold text-sm">
                  Carte {data.statut === "actif" ? "valide — membre actif" : "membre inactif"}
                </span>
              </div>

              {/* Infos coop */}
              <div className="bg-green-50 px-5 py-2 border-b border-green-100">
                <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">{data.coopNom}</p>
                <p className="text-xs text-green-600">{data.coopVille}</p>
              </div>

              {/* Infos membre */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Membre</p>
                  <p className="text-lg font-bold text-gray-900">{data.nom} {data.prenoms}</p>
                  <p className="text-sm text-amber-600 font-mono font-semibold">{data.codeMembre}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  {data.village && (
                    <div>
                      <p className="text-xs text-gray-400">Village</p>
                      <p className="text-sm font-medium text-gray-700">{data.village}</p>
                    </div>
                  )}
                  {data.superficieHa && (
                    <div>
                      <p className="text-xs text-gray-400">Superficie</p>
                      <p className="text-sm font-medium text-gray-700">{data.superficieHa} ha</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400">Adhésion</p>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(data.dateAdhesion).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-4">
                <p className="text-xs text-gray-300 text-center">
                  Vérifié le {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
