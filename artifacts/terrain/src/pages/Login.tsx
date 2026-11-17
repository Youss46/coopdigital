import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { loginTerrain } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  COMPTE_DESACTIVE_MESSAGE,
  getAuthMessage,
  isAccountDisabled,
} from "../lib/auth";

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

function formatTelephone(telephone: string) {
  return telephone.replace(/\D/g, "").slice(0, 10).replace(/(\d{2})(?=\d)/g, "$1 ");
}

function caretPositionAfterDigits(formattedTelephone: string, digitsBeforeCaret: number) {
  if (digitsBeforeCaret === 0) return 0;
  let digitsSeen = 0;
  for (let index = 0; index < formattedTelephone.length; index += 1) {
    if (/\d/.test(formattedTelephone[index])) digitsSeen += 1;
    if (digitsSeen === digitsBeforeCaret) return index + 1;
  }
  return formattedTelephone.length;
}

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [telephone, setTelephone] = useState("");
  const telephoneInputRef = useRef<HTMLInputElement>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState(() => getAuthMessage() ?? "");
  const [loading, setLoading] = useState(false);
  const [voirMdp, setVoirMdp] = useState(false);

  function handleTelephoneChange(value: string, caret: number | null) {
    const digitsBeforeCaret = value.slice(0, caret ?? value.length).replace(/\D/g, "").length;
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const formatted = formatTelephone(digits);
    setTelephone(digits);

    const nextCaret = caretPositionAfterDigits(formatted, Math.min(digitsBeforeCaret, digits.length));
    requestAnimationFrame(() => {
      const input = telephoneInputRef.current;
      if (input && document.activeElement === input) {
        input.setSelectionRange(nextCaret, nextCaret);
      }
    });
  }

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
      const msg = (err as Error).message || "";
      if (isAccountDisabled()) {
        setErreur(getAuthMessage() ?? COMPTE_DESACTIVE_MESSAGE);
      } else {
        setErreur(msg || "Numéro ou mot de passe incorrect");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="t-login">
      <img src={`${import.meta.env.BASE_URL}logo-512.png`} alt="CoopDigital" className="t-login__logo" style={{ width: "8rem", height: "8rem", borderRadius: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", objectFit: "contain", margin: "0 auto" }} />
      <div className="t-login__brand">CoopDigital</div>
      <div className="t-login__sub">Agent terrain</div>

      <div className="t-login__card">
        <form onSubmit={handleSubmit} className="t-gap">
          {erreur && <div className="t-login__error">⚠️ {erreur}</div>}
          {isAccountDisabled() && (
            <div style={{ marginTop: "-0.5rem", color: "#92400e", fontSize: "0.82rem", lineHeight: 1.45 }}>
              Vos opérations hors connexion sont conservées sur cet appareil et ne seront pas synchronisées tant que le compte ne sera pas réactivé.
            </div>
          )}

          <div className="t-field">
            <label className="t-label" htmlFor="tel">Numéro de téléphone</label>
            <input
              id="tel"
              type="tel"
              ref={telephoneInputRef}
              className="t-input t-input--lg"
              placeholder="07 00 00 00 00"
              value={formatTelephone(telephone)}
              onChange={(e) => handleTelephoneChange(e.target.value, e.currentTarget.selectionStart)}
              autoComplete="tel"
              inputMode="tel"
              minLength={14} maxLength={14} pattern="(?:[0-9]{2} ){4}[0-9]{2}"
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
                  color: "#9ca3af",
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
