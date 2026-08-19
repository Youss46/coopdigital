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

// Taux de commission
// Même modèle que les délégués terrain : un utilisateur coopératif authentifié
// peut administrer les taux sans dépendre du module de permissions « delegues ».
router.get("/delegues-localites/commissions/taux",            authMiddleware, listTauxHandler);
router.post("/delegues-localites/commissions/taux",           authMiddleware, upsertTauxHandler);
router.delete("/delegues-localites/commissions/taux/:tauxId", authMiddleware, deleteTauxHandler);

// Récapitulatif global
router.get("/delegues-localites/commissions/recap",           checkPermission("delegues", "lire"),    getRecapHandler);

// Par membre délégué
router.get("/delegues-localites/:membreId/commissions",       checkPermission("delegues", "lire"),    getCommissionsHandler);
router.post("/delegues-localites/:membreId/commissions/payer", checkPermission("delegues", "modifier"), payerHandler);

export default router;
