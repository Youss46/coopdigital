import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { terrainAuthMiddleware, peseurOrDelegueOnly, peseurOnly, flexAuthMiddleware } from "../middlewares/terrainAuth.js";
import { denyComptableRestrictedModules } from "../middlewares/permissions.js";
import type { Request, Response } from "express";
import { listerBonsReception, synchroniserBonsReceptionEnPesee } from "../services/bonReceptionService.js";
import {
  creerBonTerrainHandler,
  getBonReceptionOptionsTerrainHandler,
} from "../controllers/bonReceptionController.js";
import {
  handleGetBalancesAlertes,
  handleGetBalances,
  handleCreateBalance,
  handleUpdateBalance,
  handleCreateVerification,
  handleValiderDoublePesee,
  handleGetLitiges,
  handleCreateLitige,
  handleResoudreLitige,
  handleGetStatistiques,
  handleGetRapportAgent,
  handleGetConfig,
  handleUpdateConfig,
  handleCreateSession,
  handleGetSessions,
  handleGetSession,
  handleAddLigne,
  handleDeleteLigne,
  handleTerminerSession,
  handleAnnulerSession,
  handleConvertirSessionEnLivraison,
  handleExpirerSessionsStales,
  handleGetBordereauSession,
  handleBatchCreateSession,
  handleGetExpeditionsApreparer,
} from "../controllers/peseeController";

const router = Router();
const cooperativePeseeMiddleware = [authMiddleware, denyComptableRestrictedModules];

// Alertes AVANT la route /:id pour éviter les conflits
router.get("/pesee/balances/alertes",        ...cooperativePeseeMiddleware, handleGetBalancesAlertes);
router.get("/pesee/balances",                ...cooperativePeseeMiddleware, handleGetBalances);
router.post("/pesee/balances",               ...cooperativePeseeMiddleware, handleCreateBalance);
router.put("/pesee/balances/:id",            ...cooperativePeseeMiddleware, handleUpdateBalance);
router.post("/pesee/balances/:id/verification", ...cooperativePeseeMiddleware, handleCreateVerification);

router.post("/pesee/valider",                ...cooperativePeseeMiddleware, handleValiderDoublePesee);

router.get("/pesee/litiges",                 ...cooperativePeseeMiddleware, handleGetLitiges);
router.post("/pesee/litiges",                ...cooperativePeseeMiddleware, handleCreateLitige);
router.put("/pesee/litiges/:id/resoudre",    ...cooperativePeseeMiddleware, handleResoudreLitige);

router.get("/pesee/statistiques",            ...cooperativePeseeMiddleware, handleGetStatistiques);
router.get("/pesee/rapport-agent/:agent_id", ...cooperativePeseeMiddleware, handleGetRapportAgent);

router.get("/pesee/config",                  ...cooperativePeseeMiddleware, handleGetConfig);
router.put("/pesee/config",                  ...cooperativePeseeMiddleware, handleUpdateConfig);

// ── Sessions de pesée ─────────────────────────────────────────────────────────
// Ces routes sont utilisées par les peseurs (app terrain) — elles utilisent
// terrainAuthMiddleware pour ne pas passer par le tenantGuard de licence.
// Route fixe avant les routes paramétrées /:id
router.post("/pesee/sessions/expirer",                terrainAuthMiddleware, peseurOrDelegueOnly, handleExpirerSessionsStales);
router.post("/pesee/sessions/batch",                  terrainAuthMiddleware, peseurOrDelegueOnly, handleBatchCreateSession);
router.get("/pesee/expeditions/prechargement",         terrainAuthMiddleware, peseurOnly, handleGetExpeditionsApreparer);
router.post("/pesee/sessions",                        terrainAuthMiddleware, peseurOrDelegueOnly, handleCreateSession);
router.get("/pesee/sessions",                         flexAuthMiddleware, denyComptableRestrictedModules, handleGetSessions);
router.get("/pesee/sessions/:id",                     flexAuthMiddleware, denyComptableRestrictedModules, handleGetSession);
router.post("/pesee/sessions/:id/lignes",             terrainAuthMiddleware, peseurOrDelegueOnly, handleAddLigne);
router.delete("/pesee/sessions/:id/lignes/:ligneId",  terrainAuthMiddleware, peseurOrDelegueOnly, handleDeleteLigne);
router.put("/pesee/sessions/:id/terminer",            terrainAuthMiddleware, peseurOrDelegueOnly, handleTerminerSession);
router.put("/pesee/sessions/:id/annuler",             terrainAuthMiddleware, peseurOrDelegueOnly, handleAnnulerSession);
router.put("/pesee/sessions/:id/livraison",           terrainAuthMiddleware, peseurOrDelegueOnly, handleConvertirSessionEnLivraison);
router.get("/pesee/sessions/:id/bordereau",           flexAuthMiddleware, denyComptableRestrictedModules, handleGetBordereauSession);

// ── Bons de réception membres délégués (peseur terrain central) ───────────────
router.get("/terrain/bons-reception/options", terrainAuthMiddleware, peseurOnly, getBonReceptionOptionsTerrainHandler);
router.post("/terrain/bons-reception", terrainAuthMiddleware, peseurOnly, creerBonTerrainHandler);
router.get("/terrain/bons-reception/en-attente", terrainAuthMiddleware, peseurOnly,
  async (req: Request, res: Response) => {
    const cooperativeId = req.agent?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    try {
      await synchroniserBonsReceptionEnPesee(cooperativeId);
      const bons = await listerBonsReception(cooperativeId, { statuts: ["en_attente_pesee", "en_pesee"] });
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Vary", "Authorization");
      res.json(bons);
    } catch (err) {
      req.log.error({ err }, "getBonsEnAttente terrain");
      res.status(500).json({ erreur: "Erreur interne" });
    }
  },
);

export default router;
