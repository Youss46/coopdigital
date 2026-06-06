import { useState, useEffect } from "react";
import { Download, X, Wifi, WifiOff } from "lucide-react";

// Événement natif du navigateur pour le prompt d'installation PWA
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Bannière d'installation Android ─────────────────────────────────────────

export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("pwa_install_dismissed") === "1"
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!promptEvent || dismissed) return null;

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setPromptEvent(null);
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("pwa_install_dismissed", "1");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe">
      <div className="bg-green-800 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Download size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">Installer CoopDigital</p>
          <p className="text-green-200 text-xs mt-0.5">
            Accédez rapidement à votre espace depuis l'écran d'accueil
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="bg-white text-green-800 font-bold text-sm px-4 py-2 rounded-xl hover:bg-green-50 active:bg-green-100 transition-colors"
          >
            Installer
          </button>
          <button
            onClick={handleDismiss}
            className="text-green-300 hover:text-white p-1"
            aria-label="Ignorer"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
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
