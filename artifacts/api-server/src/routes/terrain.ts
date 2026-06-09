import { Router } from "express";
import { terrainAuthMiddleware } from "../middlewares/terrainAuth.js";
import {
  loginTerrainHandler,
  getProfilHandler,
  getPrixHandler,
  getFournisseursHandler,
  getFournisseurRecapHandler,
  postCollecteHandler,
  postPaiementHandler,
  postAvanceHandler,
  getBilanJourHandler,
  postSyncHandler,
  postRapportHandler,
  changePasswordHandler,
} from "../controllers/terrainController.js";

const router = Router();

// Auth terrain (public)
router.post("/terrain/auth/login", loginTerrainHandler);
router.post("/terrain/auth/change-password", terrainAuthMiddleware, changePasswordHandler);

// Routes protégées (délégué uniquement)
router.get("/terrain/profil", terrainAuthMiddleware, getProfilHandler);
router.get("/terrain/prix", terrainAuthMiddleware, getPrixHandler);
router.get("/terrain/fournisseurs", terrainAuthMiddleware, getFournisseursHandler);
router.get("/terrain/fournisseur/:id/recap", terrainAuthMiddleware, getFournisseurRecapHandler);
router.post("/terrain/collecte", terrainAuthMiddleware, postCollecteHandler);
router.post("/terrain/paiement", terrainAuthMiddleware, postPaiementHandler);
router.post("/terrain/avance", terrainAuthMiddleware, postAvanceHandler);
router.get("/terrain/bilan-jour", terrainAuthMiddleware, getBilanJourHandler);
router.post("/terrain/sync", terrainAuthMiddleware, postSyncHandler);
router.post("/terrain/rapport-journalier", terrainAuthMiddleware, postRapportHandler);

export default router;
