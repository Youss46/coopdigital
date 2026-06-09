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
} from "../controllers/delegueController.js";

const router = Router();

// Routes terrain (JWT delegue)
router.get("/terrain/caisse", terrainAuthMiddleware, getCaisseHandler);
router.get("/terrain/paiements-differes", terrainAuthMiddleware, getPaiementsDifferesHandler);
router.post("/terrain/regulariser/:livraisonId", terrainAuthMiddleware, regulariserPaiementHandler);

// Routes admin (JWT coopérative)
router.get("/delegues", authMiddleware, listDeleguesHandler);
router.get("/delegues/paiements-differes", authMiddleware, getPaiementsDifferesAdminHandler);
router.get("/delegues/:agentId/caisse", authMiddleware, getDetailCaisseHandler);
router.post("/delegues/:agentId/approvisionner", authMiddleware, approvisionnerHandler);

export default router;
