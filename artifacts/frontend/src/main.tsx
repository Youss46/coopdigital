import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

const LEGACY_API_CACHE = "api-cache-v1";

registerSW({
  onRegistered(r) {
    // Supprime le cache partagé créé par les anciennes versions. Les données
    // API sont authentifiées et ne doivent pas survivre entre deux comptes.
    if ("caches" in window) {
      void window.caches.delete(LEGACY_API_CACHE);
    }
    if (r) {
      setInterval(() => r.update(), 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    console.info("CoopDigital prêt hors connexion");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
