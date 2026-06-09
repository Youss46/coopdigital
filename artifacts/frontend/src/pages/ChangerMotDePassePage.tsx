import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const labels = ["", "Très faible", "Faible", "Moyen", "Bon", "Excellent"];
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-400", "bg-green-600"];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= score ? colors[score] : "bg-gray-200"}`} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{labels[score]}</div>
    </div>
  );
}

export default function ChangerMotDePassePage() {
  const { utilisateur, token } = useAuth();
  const [, navigate] = useLocation();
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [afficher, setAfficher] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (nouveauMdp.length < 8) { setErreur("Minimum 8 caractères requis"); return; }
    if (nouveauMdp !== confirmation) { setErreur("Les mots de passe ne correspondent pas"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/auth/changer-mot-de-passe`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ nouveauMotDePasse: nouveauMdp }),
      });
      const data = await res.json() as { message?: string; erreur?: string };
      if (!res.ok) { setErreur(data.erreur ?? "Erreur lors du changement"); return; }
      navigate("/dashboard");
    } catch {
      setErreur("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1a4731]/10 rounded-2xl mb-4">
            <Lock size={28} className="text-[#1a4731]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1a4731]">Bienvenue sur CoopDigital !</h1>
          <p className="text-gray-500 text-sm mt-2">
            Pour votre sécurité, définissez un nouveau mot de passe personnel.
          </p>
          {utilisateur && (
            <p className="text-[#1a4731] font-semibold text-sm mt-1">{utilisateur.prenoms} {utilisateur.nom}</p>
          )}
        </div>

        {erreur && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <span>⚠️</span> {erreur}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nouveau mot de passe <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={afficher ? "text" : "password"}
                value={nouveauMdp}
                onChange={(e) => setNouveauMdp(e.target.value)}
                placeholder="Minimum 8 caractères"
                className="w-full pl-4 pr-12 py-3.5 border-2 border-gray-200 rounded-xl text-base focus:border-[#1a4731] focus:outline-none transition-colors"
                required
                minLength={8}
              />
              <button type="button" onClick={() => setAfficher(!afficher)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {afficher ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <PasswordStrength password={nouveauMdp} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Confirmer le mot de passe <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={afficher ? "text" : "password"}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="Répétez le mot de passe"
                className={`w-full pl-4 pr-4 py-3.5 border-2 rounded-xl text-base focus:outline-none transition-colors ${
                  confirmation && confirmation !== nouveauMdp
                    ? "border-red-300 focus:border-red-400"
                    : confirmation && confirmation === nouveauMdp
                    ? "border-green-300 focus:border-green-400"
                    : "border-gray-200 focus:border-[#1a4731]"
                }`}
                required
              />
              {confirmation === nouveauMdp && confirmation.length >= 8 && (
                <CheckCircle2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500" />
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || nouveauMdp.length < 8 || nouveauMdp !== confirmation}
            className="w-full py-4 bg-[#1a4731] hover:bg-[#0d2b1a] text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-[#1a4731]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>DÉFINIR MON MOT DE PASSE →</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
