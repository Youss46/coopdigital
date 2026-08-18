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

const router = Router();

// Taux de commission
router.get("/delegues-localites/commissions/taux",            checkPermission("delegues", "lire"),    listTauxHandler);
router.post("/delegues-localites/commissions/taux",           checkPermission("delegues", "modifier"), upsertTauxHandler);
router.delete("/delegues-localites/commissions/taux/:tauxId", checkPermission("delegues", "modifier"), deleteTauxHandler);

// Récapitulatif global
router.get("/delegues-localites/commissions/recap",           checkPermission("delegues", "lire"),    getRecapHandler);

// Par membre délégué
router.get("/delegues-localites/:membreId/commissions",       checkPermission("delegues", "lire"),    getCommissionsHandler);
router.post("/delegues-localites/:membreId/commissions/payer", checkPermission("delegues", "modifier"), payerHandler);

export default router;
