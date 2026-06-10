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
import {
  getMissionsHandler,
  getMissionDetailHandler,
  collecterParcelleHandler,
  soumettresMissionHandler,
  getMessagesHandler,
  sendMessageHandler,
  getStatsAgentHandler,
  getHistoriqueAgentHandler,
} from "../controllers/missionsAgentController.js";

const router = Router();

// Auth terrain (public)
router.post("/terrain/auth/login", loginTerrainHandler);
router.post("/terrain/auth/change-password", terrainAuthMiddleware, changePasswordHandler);

// Routes protégées (délégué)
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

// Routes agent terrain
router.get("/terrain/missions", terrainAuthMiddleware, getMissionsHandler);
router.get("/terrain/missions/:id", terrainAuthMiddleware, getMissionDetailHandler);
router.post("/terrain/missions/:id/parcelle/:membreId", terrainAuthMiddleware, collecterParcelleHandler);
router.post("/terrain/missions/:id/soumettre", terrainAuthMiddleware, soumettresMissionHandler);
router.get("/terrain/messages/:missionId", terrainAuthMiddleware, getMessagesHandler);
router.post("/terrain/messages/:missionId", terrainAuthMiddleware, sendMessageHandler);
router.get("/terrain/agent/stats", terrainAuthMiddleware, getStatsAgentHandler);
router.get("/terrain/agent/historique", terrainAuthMiddleware, getHistoriqueAgentHandler);

export default router;
