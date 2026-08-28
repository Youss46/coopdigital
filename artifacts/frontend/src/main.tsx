import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

registerSW({
  onRegistered(r) {
    if (r) {
      setInterval(() => r.update(), 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    console.info("CoopDigital prêt hors connexion");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
