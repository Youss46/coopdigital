import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import {
  listAvances,
  createAvance,
  getAvancesEncours,
  getAvancesReportees,
  rembourserAvance,
  updatePlanAvanceMembre,
  corrigerDateApplicationAvance,
  getRemboursementsAvanceMembre,
} from "../controllers/avancesController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/avances/encours", checkPermission("avances", "lire"), getAvancesEncours);
router.get("/avances/reportees", checkPermission("avances", "lire"), getAvancesReportees);
router.get("/avances", checkPermission("avances", "lire"), listAvances);
router.post("/avances", checkPermission("avances", "octroyer"), auditMiddleware("avances", "CREATE", { entiteType: "avance" }), createAvance);
router.put("/avances/:id/rembourser", checkPermission("avances", "rembourser"), auditMiddleware("avances", "UPDATE", { entiteIdParam: "id", entiteType: "avance" }), rembourserAvance);
router.patch("/avances/:id/plan", checkPermission("avances", "rembourser"), updatePlanAvanceMembre);
router.patch("/avances/:id/date-application", checkPermission("avances", "modifier_plan"), auditMiddleware("avances", "UPDATE", { entiteIdParam: "id", entiteType: "correction_date_avance" }), corrigerDateApplicationAvance);
router.get("/avances/:id/remboursements", checkPermission("avances", "lire"), getRemboursementsAvanceMembre);

export default router;
