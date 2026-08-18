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
import {
  listTauxHandler,
  upsertTauxHandler,
  deleteTauxHandler,
  getCommissionsDelegueHandler,
  payerCommissionsHandler,
  getRecapCommissionsHandler,
} from "../controllers/commissionController.js";
import { getAdminReleveCommissions } from "../controllers/rapportsController.js";
import {
  listAvancesDelegueHandler,
  createAvanceDelegueHandler,
  rembourserAvanceDelegueHandler,
  getRemboursementsAvanceDelegueHandler,
  getAvancesDelegueResumeHandler,
} from "../controllers/avancesDeleguesController.js";

const router = Router();

// ─── Routes terrain (JWT délégué) ────────────────────────────────────────────
router.get("/terrain/caisse",                  terrainAuthMiddleware, getCaisseHandler);
router.get("/terrain/paiements-differes",      terrainAuthMiddleware, getPaiementsDifferesHandler);
router.post("/terrain/regulariser/:livraisonId", terrainAuthMiddleware, regulariserPaiementHandler);

// ─── Routes admin (JWT coopérative) ──────────────────────────────────────────
// IMPORTANT : les routes spécifiques (alertes, paiements-differes, commissions)
// doivent être AVANT les routes paramétrées (/:agentId) pour éviter les collisions Express

router.get("/delegues/alertes",            authMiddleware, getAlertesCaissesDeleguesHandler);
router.get("/delegues/paiements-differes", authMiddleware, getPaiementsDifferesAdminHandler);
router.get("/delegues",                    authMiddleware, listDeleguesHandler);

// ─── Taux de commission (admin) ───────────────────────────────────────────────
router.get("/delegues/commissions/recap",         authMiddleware, getRecapCommissionsHandler);
router.get("/delegues/commissions/taux",         authMiddleware, listTauxHandler);
router.post("/delegues/commissions/taux",        authMiddleware, upsertTauxHandler);
router.delete("/delegues/commissions/taux/:tauxId", authMiddleware, deleteTauxHandler);

// ─── Routes paramétrées délégué (doivent rester APRÈS les routes spécifiques) ─
router.get("/delegues/:agentId/caisse",             authMiddleware, getDetailCaisseHandler);
router.get("/delegues/:agentId/commissions",                authMiddleware, getCommissionsDelegueHandler);
router.get("/delegues/:agentId/commissions/releve",         authMiddleware, getAdminReleveCommissions);
router.post("/delegues/:agentId/commissions/payer",         authMiddleware, payerCommissionsHandler);
// ─── Avances délégués ─────────────────────────────────────────────────────────
router.get("/delegues/:agentId/avances",                    authMiddleware, listAvancesDelegueHandler);
router.get("/delegues/:agentId/avances/resume",             authMiddleware, getAvancesDelegueResumeHandler);
router.post("/delegues/:agentId/avances",                   authMiddleware, createAvanceDelegueHandler);
router.post("/delegues/:agentId/avances/:avanceId/rembourser", authMiddleware, rembourserAvanceDelegueHandler);
router.get("/delegues/:agentId/avances/:avanceId/remboursements", authMiddleware, getRemboursementsAvanceDelegueHandler);

router.post("/delegues/:agentId/approvisionner",    authMiddleware, approvisionnerHandler);
router.post("/delegues/:agentId/alimenter",         authMiddleware, alimenterCaisseHandler);
router.put("/delegues/:agentId/cloturer",           authMiddleware, cloturerJourneeHandler);

export default router;
