import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
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

export default router;
