import { useState } from "react";
import { useLocation } from "wouter";
import { changerMotDePasse } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { saveAuth } from "../lib/auth";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({
  id, value, onChange, placeholder, autoComplete, required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [voir, setVoir] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={voir ? "text" : "password"}
        className="t-input t-input--lg"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        style={{ paddingRight: "2.8rem" }}
      />
      <button
        type="button"
        onClick={() => setVoir((v) => !v)}
        aria-label={voir ? "Masquer" : "Afficher"}
        style={{
          position: "absolute",
          right: "0.75rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#9ca3af",
          display: "flex",
          alignItems: "center",
        }}
      >
        <EyeIcon open={voir} />
      </button>
    </div>
  );
}

export default function ChangerMotDePasse() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const [nouveau, setNouveau] = useState("");
  const [confirmer, setConfirmer] = useState("");
  const [erreur, setErreur] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (nouveau !== confirmer) {
      setErreur("Les deux mots de passe ne correspondent pas");
      return;
    }
    if (nouveau.length < 6) {
      setErreur("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    setLoading(true);
    try {
      await changerMotDePasse(null, nouveau);
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
            <label className="t-label" htmlFor="nouveau">Nouveau mot de passe</label>
            <PasswordInput
              id="nouveau"
              value={nouveau}
              onChange={setNouveau}
              placeholder="Minimum 6 caractères"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="t-field">
            <label className="t-label" htmlFor="confirmer">Confirmer le mot de passe</label>
            <PasswordInput
              id="confirmer"
              value={confirmer}
              onChange={setConfirmer}
              placeholder="Répétez le mot de passe"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="t-btn t-btn--primary"
            disabled={loading || !nouveau || !confirmer}
          >
            {loading ? "Enregistrement…" : "Valider mon mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
