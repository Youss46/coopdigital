import { Router, type NextFunction, type Request, type Response } from "express";
import {
  listTauxHandler,
  upsertTauxHandler,
  deleteTauxHandler,
  getRecapHandler,
  getCommissionsHandler,
  payerHandler,
} from "../controllers/commissionMembreDelegueController.js";
import {
  createAvance,
  getAvancesReportees,
  getRemboursementsAvanceMembre,
  listAvances,
  rembourserAvance,
  updatePlanAvanceMembre,
} from "../controllers/avancesController.js";
import { checkPermission } from "../middlewares/permissions.js";
import { authMiddleware } from "../middlewares/auth.js";
import { tenantGuard } from "../middlewares/tenantGuard.js";

const router = Router();

function scopeDelegueLocalite(req: Request, res: Response, next: NextFunction) {
  res.locals.membreDelegueLocalite = true;
  if (req.params["membreId"]) res.locals.membreDelegueId = Number(req.params["membreId"]);
  next();
}

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

// Avances des membres délégués : même mécanisme que les délégués terrain,
// mais strictement borné aux membres de cette catégorie.
router.get("/delegues-localites/avances-reportees", checkPermission("avances", "lire"), scopeDelegueLocalite, getAvancesReportees);
router.get("/delegues-localites/avances", checkPermission("avances", "lire"), scopeDelegueLocalite, listAvances);
router.get("/delegues-localites/:membreId/avances", checkPermission("avances", "lire"), scopeDelegueLocalite, listAvances);
router.post("/delegues-localites/:membreId/avances", checkPermission("avances", "octroyer"), scopeDelegueLocalite, createAvance);
router.post("/delegues-localites/:membreId/avances/:id/rembourser", checkPermission("avances", "rembourser"), scopeDelegueLocalite, rembourserAvance);
router.patch("/delegues-localites/:membreId/avances/:id/plan", checkPermission("avances", "rembourser"), scopeDelegueLocalite, updatePlanAvanceMembre);
router.get("/delegues-localites/:membreId/avances/:id/remboursements", checkPermission("avances", "lire"), scopeDelegueLocalite, getRemboursementsAvanceMembre);

// Par membre délégué
router.get("/delegues-localites/:membreId/commissions",       checkPermission("commissions_delegues", "lire"), scopeDelegueLocalite, getCommissionsHandler);
router.post("/delegues-localites/:membreId/commissions/payer", checkPermission("commissions_delegues", "payer"), scopeDelegueLocalite, payerHandler);

export default router;
