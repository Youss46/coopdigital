import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Fingerprint, Leaf } from "lucide-react";
import "./_group.css";
import "./Modern.css";

export function Modern() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="cd-login">
      <section className="cd-login__story" aria-label="CoopDigital">
        <div className="cd-login__story-top">
          <img src="/__mockup/images/coopdigital-logo.png" alt="" className="cd-login__brand-mark" />
          <span className="cd-login__brand-name">CoopDigital</span>
        </div>
        <div className="cd-login__story-copy">
          <span className="cd-login__eyebrow"><span /> AU CŒUR DES COOPÉRATIVES</span>
          <h2>La récolte<br />commence <em>ensemble.</em></h2>
          <p>Le lien entre le terrain, les producteurs et votre coopérative.</p>
        </div>
        <div className="cd-login__pod-art" aria-hidden="true">
          <div className="cd-login__orbit cd-login__orbit--one" />
          <div className="cd-login__orbit cd-login__orbit--two" />
          <div className="cd-login__pod"><i /><i /><i /><i /><i /></div>
          <div className="cd-login__pod-leaf" />
          <div className="cd-login__art-caption"><Leaf size={14} /> CULTIVÉ AVEC SOIN <span>·</span> CÔTE D’IVOIRE</div>
        </div>
        <div className="cd-login__story-bottom">
          <span>YAMOUSSOUKRO</span>
          <span className="cd-login__story-rule" />
          <span>06°49′ N · 05°16′ W</span>
        </div>
      </section>

      <section className="cd-login__form-side">
        <div className="cd-login__mobile-brand">
          <img src="/__mockup/images/coopdigital-logo.png" alt="CoopDigital" />
          <span>CoopDigital</span>
        </div>
        <div className="cd-login__form-wrap">
          <header className="cd-login__heading">
            <span className="cd-login__kicker">VOTRE ESPACE DE TRAVAIL</span>
            <h1>Connexion</h1>
            <p>Accédez à votre espace CoopDigital</p>
          </header>

          <form className="cd-login__form" onSubmit={(event) => event.preventDefault()}>
            <label className="cd-login__field">
              <span>Adresse email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@coopdigital.ci"
                autoComplete="email"
              />
            </label>

            <label className="cd-login__field">
              <span>Mot de passe</span>
              <div className="cd-login__password">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Saisissez votre mot de passe"
                  autoComplete="current-password"
                />
                <button
                  className="cd-login__visibility"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </label>

            <button className="cd-login__submit" type="submit">
              <span>Se connecter</span><ArrowRight size={18} />
            </button>

            <div className="cd-login__separator"><span>OU</span></div>

            <button className="cd-login__biometric" type="button">
              <Fingerprint size={20} strokeWidth={1.8} />
              <span>Empreinte digitale / Face ID</span>
            </button>
          </form>

          <div className="cd-login__field-link">
            <p>Vous êtes agent terrain ?</p>
            <a href="#">
              Accéder à l'interface terrain <ArrowRight size={15} />
            </a>
          </div>
        </div>
        <footer className="cd-login__footer">
          <p>CoopDigital <span>—</span> M15 Tech, Yamoussoukro</p>
          <p>Support : 0714174082 <span>·</span> contacteyouss@gmail.com</p>
        </footer>
      </section>
    </main>
  );
}
