import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AUTH_MESSAGE_KEY, ROLE_DISABLED_MESSAGE, useAuth } from "@/contexts/AuthContext";
import { ApiError, useLogin } from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Fingerprint,
  Headset,
  Leaf,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { authentificateurPlateformeDisponible, connexionBiometrique } from "@/lib/webauthn";
import "./Login.css";

const DERNIER_EMAIL_KEY = "coop_last_email";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState(() => localStorage.getItem(DERNIER_EMAIL_KEY) ?? "");
  const [seSouvenir, setSeSouvenir] = useState(true);
  const [motDePasse, setMotDePasse] = useState("");
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [erreur, setErreur] = useState(() => localStorage.getItem(AUTH_MESSAGE_KEY) ?? "");
  const [biometrieSupportee, setBiometrieSupportee] = useState(false);
  const [biometrieEnCours, setBiometrieEnCours] = useState(false);

  useEffect(() => {
    void authentificateurPlateformeDisponible().then(setBiometrieSupportee);
  }, []);

  const traiterConnexionReussie = useCallback((data: {
    utilisateur: { id: number; nom: string; prenoms: string; role: string; cooperativeId?: number | null; motDePasseTemporaire?: boolean };
    token: string;
  }, emailConnecte: string, memoriserEmail: boolean) => {
    if (data.utilisateur.role === "agent_terrain" || data.utilisateur.role === "peseur") {
      setErreur("__AGENT_TERRAIN__");
      return;
    }
    if (memoriserEmail) {
      localStorage.setItem(DERNIER_EMAIL_KEY, emailConnecte);
    } else {
      localStorage.removeItem(DERNIER_EMAIL_KEY);
    }
    login(data.token, {
      id: data.utilisateur.id,
      nom: data.utilisateur.nom,
      prenoms: data.utilisateur.prenoms,
      role: data.utilisateur.role,
      cooperativeId: data.utilisateur.cooperativeId ?? null,
    });
    if (data.utilisateur.motDePasseTemporaire) {
      navigate("/changer-mot-de-passe");
    } else {
      navigate("/dashboard");
    }
  }, [login, navigate]);

  const handleBiometricLogin = async () => {
    if (!email) {
      setErreur("Veuillez saisir votre adresse email pour la connexion biométrique");
      return;
    }
    setErreur("");
    setBiometrieEnCours(true);
    try {
      const data = await connexionBiometrique(email);
      traiterConnexionReussie(data, email, seSouvenir);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("cancel") || message.toLowerCase().includes("annul")) {
        // L'utilisateur a annulé la demande biométrique — pas d'erreur affichée
      } else if (message) {
        setErreur(message);
      } else {
        setErreur("Authentification biométrique impossible sur cet appareil");
      }
    } finally {
      setBiometrieEnCours(false);
    }
  };

  const mutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        traiterConnexionReussie(data, email, seSouvenir);
      },
      onError: (err: unknown) => {
        const apiError = err instanceof ApiError ? err : null;
        const status = apiError?.status ?? (err as { response?: { status?: number } })?.response?.status;
        const errorData = apiError?.data && typeof apiError.data === "object"
          ? apiError.data as { code?: unknown }
          : null;
        if (errorData?.code === "ROLE_DISABLED") {
          setErreur(ROLE_DISABLED_MESSAGE);
        } else if (!status) {
          setErreur("Impossible de contacter le serveur. Vérifiez votre connexion.");
        } else if (status === 401) {
          setErreur("Email ou mot de passe incorrect");
        } else {
          setErreur("Une erreur est survenue. Réessayez.");
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");
    localStorage.removeItem(AUTH_MESSAGE_KEY);
    if (!email || !motDePasse) {
      setErreur("Veuillez remplir tous les champs");
      return;
    }
    mutation.mutate({ data: { email, motDePasse } });
  };

  return (
    <main className="coop-split">
      <section className="coop-split__story" aria-label="Présentation de CoopDigital">
        <div className="coop-split__story-inner">
          <div className="coop-split__brand">
            <img src="/login-logo.png" alt="Logo CoopDigital" />
            <div>
              <strong>Connexion</strong>
              <span>CoopDigital</span>
            </div>
          </div>

          <div className="coop-split__intro">
            <span className="coop-split__dash" aria-hidden="true" />
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
              <img src="/login-logo.png" alt="" />
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
        <div className="coop-split__mobile-brand">
          <img src="/login-logo.png" alt="" />
          <span>CoopDigital</span>
        </div>
        <div className="coop-split__panel-top">
          <div className="coop-split__panel-logo">
            <img src="/login-logo.png" alt="" />
          </div>
          <h1>Connexion</h1>
          <p>Accédez à votre espace CoopDigital</p>
          <span className="coop-split__panel-rule" aria-hidden="true" />
        </div>

        {erreur === "__AGENT_TERRAIN__" ? (
          <div className="coop-split__role-error" role="alert">
            <div className="coop-split__error-copy">
              <AlertCircle size={19} />
              <div>
                <strong>Espace non autorisé</strong>
                <p>Les agents terrain ont leur propre interface. Connectez-vous avec votre numéro de téléphone et mot de passe temporaire.</p>
              </div>
            </div>
            <a href="/terrain/login">Accéder à l'interface terrain <ArrowRight size={15} /></a>
          </div>
        ) : erreur ? (
          <div className="coop-split__error" role="alert">
            <AlertCircle size={18} />
            <span>{erreur}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="coop-split__form">
          <div className="coop-split__field">
            <label className="coop-split__field-label" htmlFor="coop-login-email"><Mail size={15} /> Adresse email</label>
            <input
              id="coop-login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="exemple@domaine.com"
              autoComplete="username"
              required
            />
          </div>

          <div className="coop-split__field">
            <label className="coop-split__field-label" htmlFor="coop-login-password"><LockKeyhole size={15} /> Mot de passe</label>
            <div className="coop-split__password">
              <input
                id="coop-login-password"
                type={afficherMdp ? "text" : "password"}
                value={motDePasse}
                onChange={(event) => setMotDePasse(event.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="coop-split__visibility"
                onClick={() => setAfficherMdp((visible) => !visible)}
                aria-label={afficherMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {afficherMdp ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>

          <div className="coop-split__options">
            <label className="coop-split__remember">
              <input
                type="checkbox"
                checked={seSouvenir}
                onChange={(event) => setSeSouvenir(event.target.checked)}
              />
              <span className="coop-split__check" aria-hidden="true" />
              <span>Se souvenir de moi</span>
            </label>
            <a
              className="coop-split__forgot"
              href="mailto:contacteyouss@gmail.com?subject=R%C3%A9initialisation%20du%20mot%20de%20passe"
            >
              Mot de passe oublié ?
            </a>
          </div>

          <button
            className="coop-split__submit"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <span className="coop-split__spinner" aria-hidden="true" />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <span>Se connecter</span>
                <span className="coop-split__submit-arrow"><ArrowRight size={21} /></span>
              </>
            )}
          </button>

          {biometrieSupportee && (
            <>
              <div className="coop-split__separator"><span>OU</span></div>
              <button
                className="coop-split__biometric"
                type="button"
                onClick={handleBiometricLogin}
                disabled={biometrieEnCours || mutation.isPending}
              >
                {biometrieEnCours ? (
                  <>
                    <span className="coop-split__spinner coop-split__spinner--green" aria-hidden="true" />
                    <span>Vérification biométrique...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint size={23} strokeWidth={1.8} />
                    <span>Empreinte digitale / Face ID</span>
                  </>
                )}
              </button>
            </>
          )}
        </form>

        <div className="coop-split__agent">
          <p>Vous êtes agent terrain ?</p>
          <a href="/terrain/login">Accéder à l'interface terrain <ArrowRight size={16} /></a>
        </div>

        <footer className="coop-split__footer">
          <p>CoopDigital — M15 Tech, Yamoussoukro</p>
          <p><Headset size={14} /> Support : 07 14 17 40 82 <span>·</span> <a href="mailto:contacteyouss@gmail.com">contacteyouss@gmail.com</a></p>
        </footer>
      </section>
    </main>
  );
}
