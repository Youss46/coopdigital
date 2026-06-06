import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [erreur, setErreur] = useState("");

  const mutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token, {
          id: data.utilisateur.id,
          nom: data.utilisateur.nom,
          prenoms: data.utilisateur.prenoms,
          role: data.utilisateur.role,
          cooperativeId: data.utilisateur.cooperativeId ?? null,
        });
        navigate("/dashboard");
      },
      onError: () => {
        setErreur("Email ou mot de passe incorrect");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (!email || !motDePasse) {
      setErreur("Veuillez remplir tous les champs");
      return;
    }
    mutation.mutate({ data: { email, motDePasse } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo-512.png"
            alt="CoopDigital"
            className="h-24 w-24 mx-auto rounded-2xl shadow-lg mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900">CoopDigital</h1>
          <p className="text-gray-500 mt-1 text-sm">Gestion des coopératives cacaoyères</p>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Connexion</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@coopdigital.ci"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ "--tw-ring-color": "#1a4731" } as React.CSSProperties}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={afficherMdp ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent pr-10 transition"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {afficherMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {erreur && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                {erreur}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 mt-2"
              style={{ backgroundColor: "#1a4731" }}
            >
              {mutation.isPending ? "Connexion en cours…" : "Se connecter"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Compte de test : admin@coopdigital.ci
          </p>
        </div>
      </div>
    </div>
  );
}
