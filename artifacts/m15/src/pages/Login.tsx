import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { loginM15 } from "@/lib/api";
import { Loader2, Lock, Mail, AlertCircle } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const [, navigate] = useLocation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await loginM15(email, mdp);
      login(res.token, res.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex flex-col justify-between w-96 bg-sidebar p-10">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">M15 Tech</div>
          <h1 className="text-3xl font-bold text-white leading-tight">CoopDigital</h1>
          <p className="text-white/50 mt-3 text-sm leading-relaxed">
            Plateforme de gestion des licences coopératives cacaoyères en Côte d'Ivoire.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { v: "250+", l: "Coopératives gérées" },
            { v: "12 000+", l: "Membres actifs" },
            { v: "99.8%", l: "Disponibilité" },
          ].map((s) => (
            <div key={s.v} className="flex items-center gap-3">
              <div className="text-2xl font-bold text-white">{s.v}</div>
              <div className="text-white/40 text-sm">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-white/20">© 2026 M15 Tech. Tous droits réservés.</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary/60 mb-1">M15 Tech</div>
            <h1 className="text-2xl font-bold">CoopDigital</h1>
          </div>

          <h2 className="text-2xl font-bold mb-1">Connexion</h2>
          <p className="text-muted-foreground text-sm mb-8">Accès réservé à l'équipe M15 Tech</p>

          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-6 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Adresse email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@m15tech.ci"
                  className="w-full pl-9 pr-3 py-2.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Mot de passe</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={mdp}
                  onChange={(e) => setMdp(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
