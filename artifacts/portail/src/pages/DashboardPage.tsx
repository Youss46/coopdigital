import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, type Livraison, type Avance, type PartsSociales, type Score } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, TrendingUp, LogOut, Bell, BellOff, BellRing } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

function NiveauBadge({ niveau }: { niveau: string | null }) {
  const cfg: Record<string, { bg: string; text: string; emoji: string }> = {
    OR: { bg: "bg-yellow-100", text: "text-yellow-800", emoji: "🥇" },
    ARGENT: { bg: "bg-gray-100", text: "text-gray-700", emoji: "🥈" },
    BRONZE: { bg: "bg-orange-100", text: "text-orange-700", emoji: "🥉" },
    EMERAUDE: { bg: "bg-green-100", text: "text-green-700", emoji: "💚" },
  };
  const c = cfg[niveau?.toUpperCase() ?? ""] ?? { bg: "bg-gray-100", text: "text-gray-700", emoji: "⭐" };
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${c.bg} ${c.text}`}>
      {c.emoji} {niveau ?? "—"}
    </span>
  );
}

export default function DashboardPage() {
  const { profil, logout } = useAuth();
  const [, setLoc] = useLocation();
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [parts, setParts] = useState<PartsSociales | null>(null);
  const [score, setScore] = useState<Score>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);
  const { isSupported, permission, subscribed, subscribe } = usePushNotifications(!!profil);

  useEffect(() => {
    Promise.all([api.livraisons(), api.avances(), api.partsSociales(), api.score()])
      .then(([l, a, p, s]) => { setLivraisons(l); setAvances(a); setParts(p); setScore(s); })
      .finally(() => setLoading(false));
  }, []);

  const avanceEnCours = avances.find(a => a.statut === "en_cours");
  const intrantsDus = 0;

  const now = new Date();
  const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const livraisonsMois = livraisons.filter(l => l.dateLivraison >= moisDebut);
  const kgMois = livraisonsMois.reduce((s, l) => s + Number(l.poidsKg), 0);
  const campagneId = profil?.campagneActive?.id;
  const livraisonsCampagne = campagneId ? livraisons.filter(l => l.campagneId === campagneId) : livraisons;
  const kgCampagne = livraisonsCampagne.reduce((s, l) => s + Number(l.poidsKg), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-700 px-5 pt-8 pb-8 relative">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Cloche notifications push */}
          {isSupported && (
            <button
              onClick={() => { if (permission !== "denied") subscribe(); }}
              className={`p-2 rounded-xl transition-colors ${
                permission === "granted" && subscribed
                  ? "bg-white/20"
                  : "bg-white/10 hover:bg-white/20"
              }`}
              title={
                permission === "granted" && subscribed
                  ? "Notifications activées"
                  : permission === "denied"
                  ? "Notifications bloquées (autorisez dans les réglages)"
                  : "Activer les notifications"
              }
            >
              {permission === "denied" ? (
                <BellOff className="w-5 h-5 text-white/40" />
              ) : permission === "granted" && subscribed ? (
                <BellRing className="w-5 h-5 text-yellow-300" />
              ) : (
                <Bell className="w-5 h-5 text-white/70" />
              )}
            </button>
          )}
          <button
            onClick={() => setConfirmDeconnexion(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            title="Déconnexion"
          >
            <LogOut className="w-5 h-5 text-white/70" />
          </button>
        </div>
        <p className="text-green-300 text-base mb-1">Bonjour 👋</p>
        <h1 className="text-3xl font-bold text-white">
          {profil?.prenoms} {profil?.nom}
        </h1>
        {profil?.campagneActive && (
          <p className="text-green-200 text-base mt-2">{profil.campagneActive.libelle}</p>
        )}
        <p className="text-green-300 text-sm mt-1">{profil?.codeMembre}</p>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Solde */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">💰</span>
            <h2 className="text-xl font-bold text-gray-900">Mon solde</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-base text-gray-600">Avance en cours</span>
              <span className="text-base font-bold text-red-600">
                {avanceEnCours ? `${fmt(avanceEnCours.soldeRestantFcfa)} FCFA` : "Aucune"}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-base text-gray-600">Intrants dus</span>
              <span className="text-base font-bold text-orange-600">{fmt(intrantsDus)} FCFA</span>
            </div>
            <div className="flex justify-between items-center py-3 bg-red-50 rounded-2xl px-4">
              <span className="text-base font-bold text-gray-900">Total à rembourser</span>
              <span className="text-lg font-black text-red-700">
                {fmt((avanceEnCours?.soldeRestantFcfa ?? 0) + intrantsDus)} FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Livraisons */}
        <button
          onClick={() => setLoc("/livraisons")}
          className="w-full bg-white rounded-3xl shadow-sm p-6 text-left active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">📦</span>
            <h2 className="text-xl font-bold text-gray-900">Mes livraisons</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-green-700">{livraisonsMois.length}</div>
              <div className="text-sm text-green-600 mt-1">livraisons ce mois</div>
              <div className="text-base font-bold text-green-800 mt-1">{fmt(kgMois)} kg</div>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-blue-700">{livraisonsCampagne.length}</div>
              <div className="text-sm text-blue-600 mt-1">livraisons campagne</div>
              <div className="text-base font-bold text-blue-800 mt-1">{fmt(kgCampagne)} kg</div>
            </div>
          </div>
        </button>

        {/* Parts sociales */}
        <button
          onClick={() => setLoc("/parts-sociales")}
          className="w-full bg-white rounded-3xl shadow-sm p-6 text-left active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🌱</span>
            <h2 className="text-xl font-bold text-gray-900">Mes parts sociales</h2>
          </div>
          {parts ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-base text-gray-600">{parts.nbrePartsSouscrites} parts souscrites</span>
                <span className="text-base font-bold text-gray-900">{fmt(parts.valeurNominaleFcfa)} FCFA/part</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Libéré</span>
                  <span className="font-bold text-green-700">{parts.pctLibere}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${Math.min(parts.pctLibere, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-500">{fmt(parts.totalLibereFcfa)} FCFA</span>
                  <span className="text-gray-500">{fmt(parts.totalSouscritFcfa)} FCFA</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-base">Aucune donnée disponible</p>
          )}
        </button>

        {/* Score */}
        <button
          onClick={() => setLoc("/avances")}
          className="w-full bg-white rounded-3xl shadow-sm p-6 text-left active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">⭐</span>
            <h2 className="text-xl font-bold text-gray-900">Mon niveau</h2>
          </div>
          {score ? (
            <div className="flex items-center justify-between">
              <div>
                <NiveauBadge niveau={score.niveau} />
                <div className="mt-3 text-2xl font-black text-gray-900">
                  {score.scoreGlobal.toFixed(0)}<span className="text-base font-normal text-gray-500">/100</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-base text-gray-600">
                    {score.rang ? `${score.rang}ème sur ${score.totalMembres} membres` : "Rang non calculé"}
                  </span>
                </div>
              </div>
              <div className="w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" stroke="#16a34a" strokeWidth="3"
                    strokeDasharray={`${score.scoreGlobal} ${100 - score.scoreGlobal}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-base">Score non encore calculé</p>
          )}
        </button>

        {/* Dernières livraisons */}
        {livraisons.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Dernières livraisons</h3>
            <div className="space-y-3">
              {livraisons.slice(0, 3).map(l => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-base font-semibold text-gray-800">{fmt(l.poidsKg)} kg</div>
                    <div className="text-sm text-gray-500">{fmtDate(l.dateLivraison)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-green-700">{fmt(l.montantNetFcfa)} FCFA</div>
                    <div className="text-xs text-gray-400">net reçu</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setLoc("/livraisons")} className="mt-4 w-full text-center text-green-600 font-semibold text-base">
              Voir tout l'historique →
            </button>
          </div>
        )}
      </div>

      <BottomNav />

      {/* Modal confirmation déconnexion */}
      {confirmDeconnexion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Déconnexion</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">Voulez-vous vraiment vous déconnecter ?</p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setConfirmDeconnexion(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmDeconnexion(false); logout(); }}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium bg-red-600 hover:bg-red-700"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
