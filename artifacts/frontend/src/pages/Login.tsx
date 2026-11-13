import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { AUTH_MESSAGE_KEY, ROLE_DISABLED_MESSAGE, useAuth } from "@/contexts/AuthContext";
import { ApiError, useLogin } from "@workspace/api-client-react";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { authentificateurPlateformeDisponible, connexionBiometrique } from "@/lib/webauthn";

const DERNIER_EMAIL_KEY = "coop_last_email";

const slides = [
  {
    image: "/hero/hero-1.png",
    titre: "Des productrices fières de leur récolte",
    citation:
      "CoopDigital valorise chaque grain de cacao, de la parcelle jusqu'à l'exportateur.",
    stat: "421 productrices membres digitalisées",
  },
  {
    image: "/hero/hero-2.png",
    titre: "Un producteur, une fiche, un QR code",
    citation:
      "Fini les registres papier. Chaque membre a sa fiche numérique et son historique complet.",
    stat: "1 545 collectes enregistrées cette campagne",
  },
  {
    image: "/hero/hero-3.png",
    titre: "Ensemble pour une production durable",
    citation:
      "Formation, traçabilité, paiements mobiles : CoopDigital accompagne vos équipes terrain.",
    stat: "100% conforme EUDR — Exportez en toute sérénité",
  },
];

const TRANSITION_MS = 900;
const SLIDE_DURATION_MS = 5500;

type Periode = "matin" | "jour" | "soir";

function getPeriodeJour(): Periode {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "matin";
  if (h >= 11 && h < 18) return "jour";
  return "soir";
}

const GRADIENT_THEMES: Record<
  Periode,
  { bgBase: string; overlayBottom: string; overlayRight: string }
> = {
  matin: {
    bgBase: "#2b1f0a",
    overlayBottom:
      "linear-gradient(to top, rgba(61,42,10,0.95), rgba(196,150,42,0.28), transparent)",
    overlayRight: "linear-gradient(to right, rgba(61,42,10,0.25), transparent)",
  },
  jour: {
    bgBase: "#0d2b1a",
    overlayBottom:
      "linear-gradient(to top, rgba(10,31,18,0.95), rgba(13,43,26,0.3), transparent)",
    overlayRight: "linear-gradient(to right, rgba(13,43,26,0.2), transparent)",
  },
  soir: {
    bgBase: "#050f09",
    overlayBottom:
      "linear-gradient(to top, rgba(3,10,6,0.97), rgba(8,20,14,0.42), transparent)",
    overlayRight: "linear-gradient(to right, rgba(5,14,9,0.3), transparent)",
  },
};

const NB_FEUILLES = 12;

function genererFeuilles() {
  return Array.from({ length: NB_FEUILLES }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    duration: 9 + Math.random() * 7,
    delay: Math.random() * 10,
    size: 14 + Math.random() * 10,
    opacity: 0.5 + Math.random() * 0.35,
  }));
}

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const [current, setCurrent] = useState(0);
  const [slideKey, setSlideKey] = useState(0);
  const crossingRef = useRef(false);
  const currentRef = useRef(0);

  const [email, setEmail] = useState(() => localStorage.getItem(DERNIER_EMAIL_KEY) ?? "");
  const [motDePasse, setMotDePasse] = useState("");
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [erreur, setErreur] = useState(() => localStorage.getItem(AUTH_MESSAGE_KEY) ?? "");
  const [biometrieSupportee, setBiometrieSupportee] = useState(false);
  const [biometrieEnCours, setBiometrieEnCours] = useState(false);

  const [periode, setPeriode] = useState<Periode>(() => getPeriodeJour());
  const [feuilles] = useState(genererFeuilles);
  const theme = GRADIENT_THEMES[periode];

  useEffect(() => {
    const t = setInterval(() => setPeriode(getPeriodeJour()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const goTo = useCallback((index: number) => {
    if (index === currentRef.current || crossingRef.current) return;
    crossingRef.current = true;
    currentRef.current = index;
    setCurrent(index);
    setSlideKey((k) => k + 1);
    setTimeout(() => {
      crossingRef.current = false;
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (currentRef.current + 1) % slides.length;
      goTo(next);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [goTo]);

  useEffect(() => {
    void authentificateurPlateformeDisponible().then(setBiometrieSupportee);
  }, []);

  const traiterConnexionReussie = useCallback((data: {
    utilisateur: { id: number; nom: string; prenoms: string; role: string; cooperativeId?: number | null; motDePasseTemporaire?: boolean };
    token: string;
  }, emailConnecte: string) => {
    if (data.utilisateur.role === "agent_terrain" || data.utilisateur.role === "peseur") {
      setErreur("__AGENT_TERRAIN__");
      return;
    }
    localStorage.setItem(DERNIER_EMAIL_KEY, emailConnecte);
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
      traiterConnexionReussie(data, email);
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
        traiterConnexionReussie(data, email);
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

  const slide = slides[current]!;

  return (
    <div className="min-h-screen flex">

      {/* ── HERO CARROUSEL ── */}
      <div
        className="hidden lg:flex lg:flex-col lg:w-3/5 relative overflow-hidden"
        style={{ backgroundColor: theme.bgBase, transition: "background-color 1.5s ease" }}
      >

        <div className="relative flex-1 overflow-hidden">

          {/* Barres de progression */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 p-3">
            {slides.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-0.5 bg-white/25 rounded-full overflow-hidden"
              >
                {i === current && (
                  <div
                    key={`progress-${slideKey}`}
                    className="h-full bg-[#c4962a] hero-progress"
                  />
                )}
                {i < current && (
                  <div className="h-full bg-white/60 w-full" />
                )}
              </div>
            ))}
          </div>

          {/* Logo */}
          <div className="absolute top-7 left-8 z-30 flex items-center gap-3">
            <img
              src="/logo-192.png"
              alt="CoopDigital"
              className="w-12 h-12 rounded-xl shadow-lg"
            />
            <div>
              <p className="text-white font-bold text-xl leading-none">CoopDigital</p>
              <p className="text-white/60 text-sm">by M15 Tech</p>
            </div>
          </div>

          {/* Slides empilées — cross-fade */}
          {slides.map((s, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                opacity: i === current ? 1 : 0,
                transition: `opacity ${TRANSITION_MS}ms ease-in-out`,
                zIndex: i === current ? 2 : 1,
              }}
            >
              {/* Image Ken Burns — remontée via key pour redémarrer l'animation */}
              <img
                key={i === current ? `kb-${slideKey}` : `idle-${i}`}
                src={s.image}
                alt={s.titre}
                className="w-full h-full object-cover hero-ken-burns"
              />
              {/* Dégradé bas — teinte dynamique selon l'heure */}
              <div
                className="absolute inset-0"
                style={{ backgroundImage: theme.overlayBottom, transition: "background-image 1.5s ease" }}
              />
              {/* Dégradé côté gauche léger */}
              <div
                className="absolute inset-0"
                style={{ backgroundImage: theme.overlayRight, transition: "background-image 1.5s ease" }}
              />
            </div>
          ))}

          {/* Particules — feuilles de cacao qui tombent doucement */}
          <div className="absolute inset-0 z-[4] pointer-events-none overflow-hidden" aria-hidden="true">
            {feuilles.map((f) => (
              <span
                key={f.id}
                className="hero-leaf select-none"
                style={{
                  left: `${f.left}%`,
                  animationDuration: `${f.duration}s`,
                  animationDelay: `${f.delay}s`,
                  fontSize: `${f.size}px`,
                  opacity: f.opacity,
                }}
              >
                🍃
              </span>
            ))}
          </div>

          {/* Texte — remonté via key pour stagger */}
          <div
            key={`text-${slideKey}`}
            className="absolute bottom-0 left-0 right-0 z-10 p-10"
          >
            {/* Badge stat */}
            <div className="hero-anim-badge inline-flex items-center gap-2 bg-[#c4962a]/90 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-semibold mb-5">
              <span>📊</span>
              <span>{slide.stat}</span>
            </div>

            {/* Titre */}
            <h2 className="hero-anim-title text-white text-3xl font-bold leading-tight mb-3 drop-shadow-lg">
              {slide.titre}
            </h2>

            {/* Citation */}
            <p className="hero-anim-cite text-white/80 text-lg leading-relaxed mb-8 max-w-lg">
              "{slide.citation}"
            </p>

            {/* Navigation */}
            <div className="hero-anim-nav flex items-center gap-3">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`transition-all duration-400 rounded-full ${
                    i === current
                      ? "w-8 h-3 bg-[#c4962a]"
                      : "w-3 h-3 bg-white/40 hover:bg-white/75"
                  }`}
                />
              ))}

              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => goTo((current - 1 + slides.length) % slides.length)}
                  className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/35 border border-white/20 text-white text-xl flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  ‹
                </button>
                <button
                  onClick={() => goTo((current + 1) % slides.length)}
                  className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/35 border border-white/20 text-white text-xl flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FORMULAIRE ── */}
      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 bg-white min-h-screen">
        <div className="w-full max-w-sm">

          <div className="lg:hidden flex justify-center mb-8">
            <img
              src="/logo-512.png"
              alt="CoopDigital"
              className="w-20 h-20 rounded-2xl shadow-lg object-contain"
            />
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#1a4731] mb-2">Connexion</h1>
            <p className="text-gray-500 text-base">
              Accédez à votre espace CoopDigital
            </p>
          </div>

          {erreur === "__AGENT_TERRAIN__" ? (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <div className="flex items-start gap-2 text-amber-800 mb-2">
                <span className="text-base flex-shrink-0">🛰️</span>
                <div>
                  <p className="font-semibold mb-0.5">Espace non autorisé</p>
                  <p className="text-amber-700">Les agents terrain ont leur propre interface. Connectez-vous avec votre numéro de téléphone et mot de passe temporaire.</p>
                </div>
              </div>
              <a
                href="/terrain/login"
                className="flex items-center justify-center gap-2 w-full py-2 mt-2 bg-[#1a4731] text-white rounded-lg font-semibold text-sm hover:bg-[#0d2b1a] transition-colors"
              >
                Accéder à l'interface terrain →
              </a>
            </div>
          ) : erreur ? (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>{erreur}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-base">
                  ✉️
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@coopdigital.ci"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-200 rounded-xl text-base focus:border-[#1a4731] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-base">
                  🔒
                </span>
                <input
                  type={afficherMdp ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-3.5 border-2 border-gray-200 rounded-xl text-base focus:border-[#1a4731] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {afficherMdp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full py-4 bg-[#1a4731] hover:bg-[#0d2b1a] text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-[#1a4731]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {mutation.isPending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connexion en cours...</span>
                </>
              ) : (
                <>
                  <span>SE CONNECTER</span>
                  <span>→</span>
                </>
              )}
            </button>

            {biometrieSupportee && (
              <>
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">OU</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={biometrieEnCours || mutation.isPending}
                  className="w-full py-3.5 border-2 border-[#1a4731] text-[#1a4731] font-bold text-base rounded-xl transition-all hover:bg-[#1a4731]/5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {biometrieEnCours ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#1a4731]/30 border-t-[#1a4731] rounded-full animate-spin" />
                      <span>Vérification biométrique...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint size={20} />
                      <span>Empreinte digitale / Face ID</span>
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm mb-2">Vous êtes agent terrain ?</p>
            <a
              href="/terrain/login"
              className="text-[#1a4731] font-semibold text-sm hover:underline"
            >
              Accéder à l'interface terrain →
            </a>
          </div>


          <div className="mt-10 pt-6 border-t border-gray-100 text-center">
            <p className="text-gray-400 text-xs">CoopDigital — M15 Tech, Yamoussoukro</p>
            <p className="text-gray-400 text-xs mt-1">Support : 0714174082 · contacteyouss@gmail.com</p>
          </div>
        </div>
      </div>

      <style>{`
        /* ── Ken Burns : zoom lent sur l'image active ─────────────── */
        @keyframes kenBurns {
          0%   { transform: scale(1)    translate(0,     0);    }
          100% { transform: scale(1.08) translate(-1.5%, -0.8%); }
        }
        .hero-ken-burns {
          animation: kenBurns ${SLIDE_DURATION_MS + TRANSITION_MS}ms ease-out forwards;
          will-change: transform;
        }

        /* ── Barre de progression ──────────────────────────────────── */
        @keyframes progressBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .hero-progress {
          animation: progressBar ${SLIDE_DURATION_MS}ms linear forwards;
        }

        /* ── Entrée staggerée du texte ─────────────────────────────── */
        @keyframes heroRise {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-anim-badge {
          animation: heroRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
        }
        .hero-anim-title {
          animation: heroRise 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
        }
        .hero-anim-cite {
          animation: heroRise 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
        }
        .hero-anim-nav {
          animation: heroRise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
        }

        /* ── Particules : feuilles de cacao qui tombent ──────────────── */
        @keyframes heroLeafFall {
          0%   { top: -10%; transform: translateX(0px) rotate(0deg); opacity: 0; }
          10%  { opacity: 0.85; }
          50%  { transform: translateX(18px) rotate(160deg); }
          90%  { opacity: 0.6; }
          100% { top: 110%; transform: translateX(-14px) rotate(340deg); opacity: 0; }
        }
        .hero-leaf {
          position: absolute;
          top: -10%;
          animation-name: heroLeafFall;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: top, transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-leaf { display: none; }
        }
      `}</style>
    </div>
  );
}
