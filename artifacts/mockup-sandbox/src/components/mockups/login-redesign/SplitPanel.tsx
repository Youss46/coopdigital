import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Fingerprint,
  Headset,
  Leaf,
  ShieldCheck,
  Zap,
} from "lucide-react";
import "./_group.css";
import "./SplitPanel.css";

export function SplitPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [notice, setNotice] = useState("");

  const showLocalNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  return (
    <main className="coop-split">
      <section className="coop-split__story" aria-label="CoopDigital, au cœur des coopératives">
        <div className="coop-split__story-inner">
          <div className="coop-split__brand">
            <img src="/__mockup/images/coopdigital-logo.png" alt="Logo CoopDigital" />
            <div>
              <strong>Connexion</strong>
              <span>CoopDigital</span>
            </div>
          </div>

          <div className="coop-split__intro">
            <span className="coop-split__dash" />
            <p className="coop-split__eyebrow">LE NUMÉRIQUE AU SERVICE DU CACAO</p>
            <h2>Accédez à votre<br />espace <em>CoopDigital</em></h2>
            <p className="coop-split__story-text">
              Ensemble, construisons<br className="coop-split__desktop-break" /> une coopérative plus digitale.
            </p>
          </div>

          <div className="coop-split__devices" aria-hidden="true">
            <div className="coop-split__tablet">
              <div className="coop-split__screen-top"><i /><i /><i /></div>
              <div className="coop-split__screen-body">
                <div className="coop-split__screen-nav"><b /><i /><i /><i /><i /></div>
                <div className="coop-split__screen-main">
                  <div className="coop-split__screen-title" />
                  <div className="coop-split__mini-cards"><i /><i /><i /></div>
                  <div className="coop-split__chart"><span /><span /><span /><span /><span /><span /><span /></div>
                </div>
              </div>
            </div>
            <div className="coop-split__phone">
              <div className="coop-split__phone-camera" />
              <img src="/__mockup/images/coopdigital-logo.png" alt="" />
            </div>
            <div className="coop-split__leaf-mark"><Leaf size={26} /></div>
          </div>

          <div className="coop-split__benefits">
            <div><span><ShieldCheck size={23} /></span><b>Sécurité<br />renforcée</b></div>
            <div><span><Zap size={23} /></span><b>Accès<br />rapide</b></div>
            <div><span><BarChart3 size={23} /></span><b>Gestion<br />simplifiée</b></div>
          </div>
        </div>
        <div className="coop-split__landscape" aria-hidden="true">
          <div className="coop-split__hill coop-split__hill--gold" />
          <div className="coop-split__hill coop-split__hill--deep" />
          <span className="coop-split__landscape-caption">ENSEMBLE, FAISONS GRANDIR LA FILIÈRE</span>
        </div>
        <div className="coop-split__grain" aria-hidden="true" />
      </section>

      <section className="coop-split__panel" aria-label="Connexion">
        <div className="coop-split__panel-top">
          <div className="coop-split__panel-logo">
            <img src="/__mockup/images/coopdigital-logo.png" alt="" />
          </div>
          <h1>Connexion</h1>
          <p>Accédez à votre espace CoopDigital</p>
          <span className="coop-split__panel-rule" />
        </div>

        <form
          className="coop-split__form"
          onSubmit={(event) => {
            event.preventDefault();
            showLocalNotice("Cette maquette ne se connecte pas à un compte réel.");
          }}
        >
          <label className="coop-split__field">
            <span>Adresse email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="yerim@gmail.com"
              autoComplete="email"
            />
          </label>

          <label className="coop-split__field">
            <span>Mot de passe</span>
            <div className="coop-split__password">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Saisissez votre mot de passe"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="coop-split__visibility"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>

          <div className="coop-split__options">
            <label className="coop-split__remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span className="coop-split__check" aria-hidden="true" />
              <span>Se souvenir de moi</span>
            </label>
            <button
              type="button"
              className="coop-split__forgot"
              onClick={() => showLocalNotice("La récupération de mot de passe n’est pas disponible dans cette maquette.")}
            >
              Mot de passe oublié ?
            </button>
          </div>

          <button className="coop-split__submit" type="submit">
            <span>Se connecter</span><span className="coop-split__submit-arrow"><ArrowRight size={21} /></span>
          </button>

          <div className="coop-split__separator"><span>OU</span></div>

          <button
            className="coop-split__biometric"
            type="button"
            onClick={() => showLocalNotice("La connexion biométrique est présentée à titre visuel.")}
          >
            <Fingerprint size={23} strokeWidth={1.8} />
            <span>Empreinte digitale / Face ID</span>
          </button>
        </form>

        <div className="coop-split__agent">
          <p>Vous êtes agent terrain ?</p>
          <button type="button" onClick={() => showLocalNotice("L’accès Agent Terrain est présenté à titre visuel.")}>
            Accéder à l’interface terrain <ArrowRight size={16} />
          </button>
        </div>

        <footer className="coop-split__footer">
          <p>CoopDigital — M15 Tech, Yamoussoukro</p>
          <p><Headset size={14} /> Support : 07 14 77 48 62 <span>·</span> contacteyouss@gmail.com</p>
        </footer>
        {notice && <div className="coop-split__notice" role="status">{notice}</div>}
      </section>
    </main>
  );
}
