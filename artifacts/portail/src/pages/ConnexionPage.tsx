import { useState } from "react";
import { useLocation } from "wouter";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, AlertCircle } from "lucide-react";

export default function ConnexionPage() {
  const [, setLoc] = useLocation();
  const { login } = useAuth();
  const urlCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(urlCode);
  const [tel, setTel] = useState("");
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setLoading(true);
    try {
      const res = await api.connexion(code.trim(), tel.trim());
      setToken(res.token);
      const profil = await api.profil();
      login(profil);
      setLoc("/");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur d'authentification");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-900 flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white mb-5 overflow-hidden shadow-lg">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="CoopDigital" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white">CoopDigital</h1>
          <p className="text-green-300 mt-1 text-base">Espace membre</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Bienvenue</h2>
          <p className="text-gray-500 text-base mb-8">Connectez-vous à votre espace</p>

          {erreur && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-700 text-sm font-medium">{erreur}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-base font-semibold text-gray-700 mb-2">
                Code membre
              </label>
              <input
                type="text"
                className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-lg font-mono
                  focus:outline-none focus:border-green-500 transition-colors bg-gray-50"
                placeholder="MBR-2025-0001"
                value={code}
                onChange={e => setCode(e.target.value)}
                autoCapitalize="characters"
                required
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-gray-700 mb-2">
                Votre numéro de téléphone
              </label>
              <input
                type="tel"
                className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-lg
                  focus:outline-none focus:border-green-500 transition-colors bg-gray-50"
                placeholder="07 XX XX XX XX"
                value={tel}
                onChange={e => setTel(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !code || !tel}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800
                text-white font-bold text-lg rounded-2xl py-5 mt-2
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-3"
            >
              {loading && <Loader2 className="w-6 h-6 animate-spin" />}
              SE CONNECTER
            </button>
          </form>

          <div className="mt-8 p-5 bg-gray-50 rounded-2xl">
            <p className="text-base text-gray-600 text-center leading-relaxed">
              Vous ne connaissez pas votre code membre ?<br />
              <span className="font-semibold text-green-700">Contactez votre coopérative</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
