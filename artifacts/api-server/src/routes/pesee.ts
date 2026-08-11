import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
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
} from "../controllers/peseeController";

const router = Router();

// Alertes AVANT la route /:id pour éviter les conflits
router.get("/pesee/balances/alertes",        authMiddleware, handleGetBalancesAlertes);
router.get("/pesee/balances",                authMiddleware, handleGetBalances);
router.post("/pesee/balances",               authMiddleware, handleCreateBalance);
router.put("/pesee/balances/:id",            authMiddleware, handleUpdateBalance);
router.post("/pesee/balances/:id/verification", authMiddleware, handleCreateVerification);

router.post("/pesee/valider",                authMiddleware, handleValiderDoublePesee);

router.get("/pesee/litiges",                 authMiddleware, handleGetLitiges);
router.post("/pesee/litiges",                authMiddleware, handleCreateLitige);
router.put("/pesee/litiges/:id/resoudre",    authMiddleware, handleResoudreLitige);

router.get("/pesee/statistiques",            authMiddleware, handleGetStatistiques);
router.get("/pesee/rapport-agent/:agent_id", authMiddleware, handleGetRapportAgent);

router.get("/pesee/config",                  authMiddleware, handleGetConfig);
router.put("/pesee/config",                  authMiddleware, handleUpdateConfig);

// ── Sessions de pesée ─────────────────────────────────────────────────────────
// Route fixe avant les routes paramétrées /:id
router.post("/pesee/sessions/expirer",                authMiddleware, handleExpirerSessionsStales);
router.post("/pesee/sessions",                        authMiddleware, handleCreateSession);
router.get("/pesee/sessions",                         authMiddleware, handleGetSessions);
router.get("/pesee/sessions/:id",                     authMiddleware, handleGetSession);
router.post("/pesee/sessions/:id/lignes",             authMiddleware, handleAddLigne);
router.delete("/pesee/sessions/:id/lignes/:ligneId",  authMiddleware, handleDeleteLigne);
router.put("/pesee/sessions/:id/terminer",            authMiddleware, handleTerminerSession);
router.put("/pesee/sessions/:id/annuler",             authMiddleware, handleAnnulerSession);
router.put("/pesee/sessions/:id/livraison",           authMiddleware, checkPermission("livraisons", "creer"), handleConvertirSessionEnLivraison);

export default router;
