import { Router } from "express";
import { terrainAuthMiddleware, delegueOnly, collecteAllowed, peseurOrDelegueOnly } from "../middlewares/terrainAuth.js";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "../controllers/pushController.js";
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
  getPeseurCollectesHandler,
} from "../controllers/terrainController.js";
import { getTerrainRecuLivraison, getTerrainReleveCommissions } from "../controllers/rapportsController.js";
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
import {
  getEnquetesAgentHandler,
  getEnqueteDetailHandler,
  soumettreReponsesHandler,
  soumettreEnqueteHandler,
  syncEnquetesHandler,
} from "../controllers/enqueteAgentController.js";
import { getMesCommissionsHandler } from "../controllers/commissionController.js";

const router = Router();

// Auth terrain (public)
router.post("/terrain/auth/login", loginTerrainHandler);
router.post("/terrain/auth/change-password", terrainAuthMiddleware, changePasswordHandler);

// Routes partagées (délégué + agent terrain)
router.get("/terrain/profil", terrainAuthMiddleware, getProfilHandler);
router.get("/terrain/prix", terrainAuthMiddleware, getPrixHandler);
router.post("/terrain/sync", terrainAuthMiddleware, postSyncHandler);

// Commissions du délégué connecté
router.get("/terrain/mes-commissions", terrainAuthMiddleware, delegueOnly, getMesCommissionsHandler);

// Fournisseurs : délégué ET peseur (le service filtre par périmètre du peseur)
router.get("/terrain/fournisseurs", terrainAuthMiddleware, peseurOrDelegueOnly, getFournisseursHandler);
router.get("/terrain/fournisseur/:id/recap", terrainAuthMiddleware, peseurOrDelegueOnly, getFournisseurRecapHandler);
router.post("/terrain/collecte", terrainAuthMiddleware, collecteAllowed, postCollecteHandler);
router.post("/terrain/paiement", terrainAuthMiddleware, delegueOnly, postPaiementHandler);
router.post("/terrain/avance", terrainAuthMiddleware, delegueOnly, postAvanceHandler);
// Ouvert au délégué ET au peseur (le service filtre par agentId pour les collectes)
router.get("/terrain/bilan-jour", terrainAuthMiddleware, getBilanJourHandler);
router.post("/terrain/rapport-journalier", terrainAuthMiddleware, delegueOnly, postRapportHandler);

// Routes agent terrain
router.get("/terrain/missions", terrainAuthMiddleware, getMissionsHandler);
router.get("/terrain/missions/:id", terrainAuthMiddleware, getMissionDetailHandler);
router.post("/terrain/missions/:id/parcelle/:membreId", terrainAuthMiddleware, collecterParcelleHandler);
router.post("/terrain/missions/:id/soumettre", terrainAuthMiddleware, soumettresMissionHandler);
router.get("/terrain/messages/:missionId", terrainAuthMiddleware, getMessagesHandler);
router.post("/terrain/messages/:missionId", terrainAuthMiddleware, sendMessageHandler);
router.get("/terrain/agent/stats", terrainAuthMiddleware, getStatsAgentHandler);
router.get("/terrain/agent/historique", terrainAuthMiddleware, getHistoriqueAgentHandler);
router.get("/terrain/historique", terrainAuthMiddleware, getHistoriqueAgentHandler);

// Routes peseur
router.get("/terrain/peseur/collectes", terrainAuthMiddleware, getPeseurCollectesHandler);

// Missions d'enquête (agent terrain)
router.get("/terrain/enquetes",                              terrainAuthMiddleware, getEnquetesAgentHandler);
router.get("/terrain/enquetes/:id",                          terrainAuthMiddleware, getEnqueteDetailHandler);
router.post("/terrain/enquetes/sync",                        terrainAuthMiddleware, syncEnquetesHandler);
router.post("/terrain/enquetes/:id/membres/:membreId",       terrainAuthMiddleware, soumettreReponsesHandler);
router.post("/terrain/enquetes/:id/soumettre",               terrainAuthMiddleware, soumettreEnqueteHandler);

// Reçus PDF (délégué et peseur — le peseur ne voit que ses propres livraisons)
router.get("/terrain/recu/livraison/:id", terrainAuthMiddleware, peseurOrDelegueOnly, getTerrainRecuLivraison);

// Relevé commissions PDF (délégué)
router.get("/terrain/commissions/releve", terrainAuthMiddleware, delegueOnly, getTerrainReleveCommissions);

// Routes chauffeur
import {
  getChauffeurAccueil,
  getChauffeurMissions,
  getChauffeurBons,
  utiliserBonChauffeur,
  getChauffeurStations,
  getChauffeurVehicules,
  creerDemandeCarburant,
} from "../controllers/chauffeurTerrainController.js";
import { handleQrTokenBonStation } from "../controllers/stationController.js";

router.get("/terrain/chauffeur/accueil",                              terrainAuthMiddleware, getChauffeurAccueil);
router.get("/terrain/chauffeur/missions",                             terrainAuthMiddleware, getChauffeurMissions);
router.get("/terrain/chauffeur/bons-carburant",                       terrainAuthMiddleware, getChauffeurBons);
router.put("/terrain/chauffeur/bons-carburant/:id/utiliser",          terrainAuthMiddleware, utiliserBonChauffeur);
// QR token : réservé au chauffeur propriétaire du bon (ownership vérifié dans le contrôleur)
router.get("/terrain/chauffeur/bons-carburant/:numero/qr-token",      terrainAuthMiddleware, handleQrTokenBonStation);
router.get("/terrain/chauffeur/stations",                             terrainAuthMiddleware, getChauffeurStations);
router.get("/terrain/chauffeur/vehicules",                            terrainAuthMiddleware, getChauffeurVehicules);
router.post("/terrain/chauffeur/bons-carburant/demande",              terrainAuthMiddleware, creerDemandeCarburant);

// Push notifications
router.get("/terrain/push/vapid-key", getVapidPublicKey);
router.post("/terrain/push/subscribe", terrainAuthMiddleware, subscribePush);
router.delete("/terrain/push/subscribe", terrainAuthMiddleware, unsubscribePush);

export default router;
