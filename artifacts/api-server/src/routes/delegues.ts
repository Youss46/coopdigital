import { Router } from "express";
import { terrainAuthMiddleware } from "../middlewares/terrainAuth.js";
import { authMiddleware } from "../middlewares/auth.js";
import {
  getCaisseHandler,
  getPaiementsDifferesHandler,
  regulariserPaiementHandler,
  listDeleguesHandler,
  getDetailCaisseHandler,
  approvisionnerHandler,
  getPaiementsDifferesAdminHandler,
  alimenterCaisseHandler,
  cloturerJourneeHandler,
  getAlertesCaissesDeleguesHandler,
} from "../controllers/delegueController.js";

const router = Router();

// ─── Routes terrain (JWT délégué) ────────────────────────────────────────────
router.get("/terrain/caisse",                  terrainAuthMiddleware, getCaisseHandler);
router.get("/terrain/paiements-differes",      terrainAuthMiddleware, getPaiementsDifferesHandler);
router.post("/terrain/regulariser/:livraisonId", terrainAuthMiddleware, regulariserPaiementHandler);

// ─── Routes admin (JWT coopérative) ──────────────────────────────────────────
// IMPORTANT : les routes spécifiques (alertes, paiements-differes) doivent être
// AVANT les routes paramétrées (/:agentId) pour éviter les collisions Express

router.get("/delegues/alertes",            authMiddleware, getAlertesCaissesDeleguesHandler);
router.get("/delegues/paiements-differes", authMiddleware, getPaiementsDifferesAdminHandler);
router.get("/delegues",                    authMiddleware, listDeleguesHandler);

router.get("/delegues/:agentId/caisse",       authMiddleware, getDetailCaisseHandler);
router.post("/delegues/:agentId/approvisionner", authMiddleware, approvisionnerHandler);
router.post("/delegues/:agentId/alimenter",   authMiddleware, alimenterCaisseHandler);
router.put("/delegues/:agentId/cloturer",     authMiddleware, cloturerJourneeHandler);

export default router;
