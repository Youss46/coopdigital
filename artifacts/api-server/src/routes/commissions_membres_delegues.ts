import { Router } from "express";
import {
  listTauxHandler,
  upsertTauxHandler,
  deleteTauxHandler,
  getRecapHandler,
  getCommissionsHandler,
  payerHandler,
} from "../controllers/commissionMembreDelegueController.js";
import { checkPermission } from "../middlewares/permissions.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();

// Taux de commission : consultation pour les auditeurs, administration réservée
// aux responsables opérationnels et financiers.
router.get("/delegues-localites/commissions/taux",            authMiddleware, checkPermission("commissions_delegues", "lire"),       listTauxHandler);
router.post("/delegues-localites/commissions/taux",           authMiddleware, checkPermission("commissions_delegues", "gerer_taux"), upsertTauxHandler);
router.delete("/delegues-localites/commissions/taux/:tauxId", authMiddleware, checkPermission("commissions_delegues", "gerer_taux"), deleteTauxHandler);

// Récapitulatif global
router.get("/delegues-localites/commissions/recap",           checkPermission("commissions_delegues", "lire"),  getRecapHandler);

// Par membre délégué
router.get("/delegues-localites/:membreId/commissions",       checkPermission("commissions_delegues", "lire"),  getCommissionsHandler);
router.post("/delegues-localites/:membreId/commissions/payer", checkPermission("commissions_delegues", "payer"), payerHandler);

export default router;
