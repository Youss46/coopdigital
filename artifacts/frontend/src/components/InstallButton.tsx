import { useState, useEffect } from "react";
import { MonitorDown } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Bouton « Installer l'app » visible uniquement lorsque le navigateur
 * propose le prompt PWA (Chrome Desktop / Android). Disparaît après
 * l'installation ou si l'utilisateur refuse.
 */
export default function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setPrompt(null));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (!prompt) return null;

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  }

  return (
    <button
      onClick={handleInstall}
      title="Installer CoopDigital sur cet ordinateur"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
        text-green-700 bg-green-50 hover:bg-green-100 border border-green-200
        transition-colors"
    >
      <MonitorDown size={14} />
      <span className="hidden sm:inline">Installer l'app</span>
    </button>
  );
}
