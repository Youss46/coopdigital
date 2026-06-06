import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Enregistre le Service Worker — mise à jour automatique en arrière-plan
registerSW({
  onRegistered(r) {
    // Vérifie les mises à jour toutes les heures
    if (r) {
      setInterval(() => r.update(), 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    console.info("CoopDigital Portail prêt hors connexion");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
