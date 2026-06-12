import { useState, useEffect } from "react";
import { Download, X, Wifi, WifiOff, Share, Plus, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Détection plateforme ─────────────────────────────────────────────────────

function isIOS() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as unknown as Record<string, unknown>)["MSStream"];
}

function isInStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as Record<string, unknown>)["standalone"] === true
  );
}

function isDismissed() {
  const ts = localStorage.getItem("pwa_install_dismissed_ts");
  if (!ts) return false;
  const days7 = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - Number(ts) < days7;
}

// ─── Bannière iOS Safari ──────────────────────────────────────────────────────

function BanniereIOS({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-green-800 to-green-700 px-5 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <img
              src="/portail/logo.png"
              alt="CoopDigital"
              className="w-9 h-9 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-base leading-tight">Installer CoopDigital</p>
            <p className="text-green-200 text-xs mt-0.5">Ajoutez l'app à votre écran d'accueil</p>
          </div>
          <button onClick={onDismiss} className="text-green-300 hover:text-white p-1 shrink-0" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Sur Safari, suivez ces étapes :</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-green-800">1</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-700">
                Appuyez sur
                <span className="inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-0.5 text-xs font-medium text-gray-800">
                  <Share size={12} /> Partager
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-green-800">2</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-700">
                Choisissez
                <span className="inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-0.5 text-xs font-medium text-gray-800">
                  <Plus size={12} /> Sur l'écran d'accueil
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-green-800">3</span>
              </div>
              <p className="text-sm text-gray-700">Appuyez sur <strong>Ajouter</strong> en haut à droite</p>
            </div>
          </div>
          <button onClick={onDismiss} className="w-full mt-1 py-2 text-xs text-gray-400 hover:text-gray-600">
            Ne plus afficher
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bannière Android / Desktop ───────────────────────────────────────────────

function BanniereAndroid({
  onInstall,
  onDismiss,
  pending,
  canInstall,
}: {
  onInstall: () => void;
  onDismiss: () => void;
  pending: boolean;
  canInstall: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* En-tête vert */}
        <div className="bg-gradient-to-r from-green-800 to-green-700 px-5 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <img
              src="/portail/logo.png"
              alt="CoopDigital"
              className="w-9 h-9 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-base leading-tight">CoopDigital — Espace Membre</p>
            <p className="text-green-200 text-xs mt-0.5">Disponible comme application mobile</p>
          </div>
          <button onClick={onDismiss} className="text-green-300 hover:text-white p-1 shrink-0" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Notifications de paiement en temps réel
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Accès rapide sans ouvrir le navigateur
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Fonctionne même hors connexion
            </div>
          </div>

          {canInstall ? (
            <button
              onClick={onInstall}
              disabled={pending}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-800 active:bg-green-900 text-white font-bold text-sm px-5 py-3 rounded-2xl transition-colors disabled:opacity-60 shrink-0"
            >
              <Download size={16} />
              {pending ? "…" : "Installer"}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-1 shrink-0 text-center">
              <div className="w-10 h-10 rounded-2xl bg-green-100 flex items-center justify-center">
                <Smartphone size={18} className="text-green-700" />
              </div>
              <p className="text-xs text-gray-400 leading-tight">Ouvrez<br />sur mobile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isInStandalone() || isDismissed()) return;

    // Capture le prompt natif (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Afficher la bannière après 1,5 s quelle que soit la plateforme
    const timer = setTimeout(() => setShow(true), 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem("pwa_install_dismissed_ts", String(Date.now()));
  }

  async function handleInstall() {
    if (!promptEvent) return;
    setPending(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setShow(false);
        localStorage.setItem("pwa_install_dismissed_ts", String(Date.now()));
      }
    } finally {
      setPending(false);
    }
  }

  if (!show) return null;

  if (ios) return <BanniereIOS onDismiss={dismiss} />;

  return (
    <BanniereAndroid
      onInstall={handleInstall}
      onDismiss={dismiss}
      pending={pending}
      canInstall={!!promptEvent}
    />
  );
}

// ─── Indicateur hors-ligne ────────────────────────────────────────────────────

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
      <WifiOff size={16} />
      <span>Hors connexion — données mises en cache affichées</span>
    </div>
  );
}

// ─── Indicateur retour en ligne ───────────────────────────────────────────────

export function OnlineToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = () => {
      setShow(true);
      timer = setTimeout(() => setShow(false), 3000);
    };
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("online", on);
      clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
      <Wifi size={16} />
      Connexion rétablie
    </div>
  );
}
