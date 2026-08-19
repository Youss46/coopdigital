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
import { tenantGuard } from "../middlewares/tenantGuard.js";

const router = Router();

// Ces routes sont aussi utilisées dans des montages isolés (tests, API dédiée).
// Elles doivent donc définir leur authentification indépendamment du routeur parent.
router.use("/delegues-localites", authMiddleware, tenantGuard);

// Taux de commission : consultation pour les auditeurs, administration réservée
// aux responsables opérationnels et financiers.
router.get("/delegues-localites/commissions/taux",            checkPermission("commissions_delegues", "lire"),       listTauxHandler);
router.post("/delegues-localites/commissions/taux",           checkPermission("commissions_delegues", "gerer_taux"), upsertTauxHandler);
router.delete("/delegues-localites/commissions/taux/:tauxId", checkPermission("commissions_delegues", "gerer_taux"), deleteTauxHandler);

// Récapitulatif global
router.get("/delegues-localites/commissions/recap",           checkPermission("commissions_delegues", "lire"),  getRecapHandler);

// Par membre délégué
router.get("/delegues-localites/:membreId/commissions",       checkPermission("commissions_delegues", "lire"),  getCommissionsHandler);
router.post("/delegues-localites/:membreId/commissions/payer", checkPermission("commissions_delegues", "payer"), payerHandler);

export default router;
