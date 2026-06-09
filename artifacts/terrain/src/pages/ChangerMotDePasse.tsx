import { useState } from "react";
import { useLocation } from "wouter";
import { changerMotDePasse } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { saveAuth } from "../lib/auth";

export default function ChangerMotDePasse() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmer, setConfirmer] = useState("");
  const [erreur, setErreur] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (nouveau !== confirmer) {
      setErreur("Les deux nouveaux mots de passe ne correspondent pas");
      return;
    }
    if (nouveau.length < 6) {
      setErreur("Le nouveau mot de passe doit contenir au moins 6 caractères");
      return;
    }
    setLoading(true);
    try {
      await changerMotDePasse(actuel, nouveau);
      if (user && token) {
        saveAuth(token, { ...user, motDePasseTemporaire: false });
      }
      setLocation("/");
    } catch (err) {
      setErreur((err as Error).message || "Erreur lors du changement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="t-login">
      <img
        src="/logo-512.png"
        alt="CoopDigital"
        className="t-login__logo"
        style={{ width: "5rem", height: "5rem", borderRadius: "1.2rem", objectFit: "contain", margin: "0 auto" }}
      />
      <div className="t-login__brand">Nouveau mot de passe</div>
      <div className="t-login__sub">Bonjour {user?.prenoms} — choisissez votre mot de passe personnel</div>

      <div
        style={{
          background: "rgba(255,255,255,.12)",
          borderRadius: 12,
          padding: "10px 16px",
          margin: "0 16px 4px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>🔐</span>
        <p style={{ color: "#fff", fontSize: ".82rem", margin: 0, lineHeight: 1.5, opacity: .9 }}>
          Votre compte dispose d'un mot de passe temporaire. Définissez un mot de passe personnel pour sécuriser votre accès.
        </p>
      </div>

      <div className="t-login__card">
        <form onSubmit={handleSubmit} className="t-gap">
          {erreur && <div className="t-login__error">⚠️ {erreur}</div>}

          <div className="t-field">
            <label className="t-label" htmlFor="actuel">Mot de passe temporaire</label>
            <input
              id="actuel"
              type="password"
              className="t-input t-input--lg"
              placeholder="••••••••"
              value={actuel}
              onChange={(e) => setActuel(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="t-field">
            <label className="t-label" htmlFor="nouveau">Nouveau mot de passe</label>
            <input
              id="nouveau"
              type="password"
              className="t-input t-input--lg"
              placeholder="Minimum 6 caractères"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="t-field">
            <label className="t-label" htmlFor="confirmer">Confirmer le mot de passe</label>
            <input
              id="confirmer"
              type="password"
              className="t-input t-input--lg"
              placeholder="Répétez le nouveau mot de passe"
              value={confirmer}
              onChange={(e) => setConfirmer(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="t-btn t-btn--primary"
            disabled={loading || !actuel || !nouveau || !confirmer}
          >
            {loading ? "Enregistrement…" : "Valider mon mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
