import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import {
  listAvances,
  createAvance,
  getAvancesEncours,
  rembourserAvance,
} from "../controllers/avancesController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/avances/encours", checkPermission("avances", "lire"), getAvancesEncours);
router.get("/avances", checkPermission("avances", "lire"), listAvances);
router.post("/avances", checkPermission("avances", "octroyer"), auditMiddleware("avances", "CREATE", { entiteType: "avance" }), createAvance);
router.put("/avances/:id/rembourser", checkPermission("avances", "rembourser"), auditMiddleware("avances", "UPDATE", { entiteIdParam: "id", entiteType: "avance" }), rembourserAvance);

export default router;
