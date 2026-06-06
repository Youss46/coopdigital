import { useState } from "react";
import { useLocation } from "wouter";
import { loginTerrain } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!telephone.trim() || !motDePasse) return;
    setErreur("");
    setLoading(true);
    try {
      const result = await loginTerrain(telephone.trim(), motDePasse);
      login(result.token, result.agent);
      setLocation("/");
    } catch (err) {
      setErreur((err as Error).message || "Numéro ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="t-login">
      <div className="t-login__logo">🌱</div>
      <div className="t-login__brand">CoopDigital</div>
      <div className="t-login__sub">Agent Terrain</div>

      <div className="t-login__card">
        <form onSubmit={handleSubmit} className="t-gap">
          {erreur && <div className="t-login__error">⚠️ {erreur}</div>}

          <div className="t-field">
            <label className="t-label" htmlFor="tel">Numéro de téléphone</label>
            <input
              id="tel"
              type="tel"
              className="t-input t-input--lg"
              placeholder="07 00 00 00 00"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          <div className="t-field">
            <label className="t-label" htmlFor="mdp">Mot de passe</label>
            <input
              id="mdp"
              type="password"
              className="t-input t-input--lg"
              placeholder="••••••••"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="t-btn t-btn--primary"
            disabled={loading || !telephone.trim() || !motDePasse}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
