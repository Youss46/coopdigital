import { useState } from "react";
import { useLocation } from "wouter";
import { loginTerrain } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [loading, setLoading] = useState(false);
  const [voirMdp, setVoirMdp] = useState(false);

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
      <img src="/logo-512.png" alt="CoopDigital" className="t-login__logo" style={{ width: "8rem", height: "8rem", borderRadius: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", objectFit: "contain", margin: "0 auto" }} />
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
            <div style={{ position: "relative" }}>
              <input
                id="mdp"
                type={voirMdp ? "text" : "password"}
                className="t-input t-input--lg"
                placeholder="••••••••"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: "2.8rem" }}
              />
              <button
                type="button"
                onClick={() => setVoirMdp((v) => !v)}
                aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.65)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <EyeIcon open={voirMdp} />
              </button>
            </div>
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
