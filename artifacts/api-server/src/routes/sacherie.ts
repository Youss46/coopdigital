import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permissions.js";
import { auditMiddleware } from "../middlewares/auditMiddleware.js";
import {
  createMouvementSacherie,
  createTypeSac,
  getResumeSacherie,
  listMembresSacherie,
  listMouvementsSacherie,
  listTypesSacs,
  updateTypeSac,
} from "../controllers/sacherieController.js";

const router = Router();

router.use("/sacherie", authMiddleware);
router.get("/sacherie/resume", checkPermission("sacherie", "lire"), getResumeSacherie);
router.get("/sacherie/types", checkPermission("sacherie", "lire"), listTypesSacs);
router.post("/sacherie/types", checkPermission("sacherie", "gerer_types"), auditMiddleware("sacherie", "CREATE", { entiteType: "type_sac" }), createTypeSac);
router.patch("/sacherie/types/:id", checkPermission("sacherie", "gerer_types"), auditMiddleware("sacherie", "UPDATE", { entiteIdParam: "id", entiteType: "type_sac" }), updateTypeSac);
router.get("/sacherie/membres", checkPermission("sacherie", "lire"), listMembresSacherie);
router.get("/sacherie/mouvements", checkPermission("sacherie", "lire"), listMouvementsSacherie);
router.post("/sacherie/mouvements", checkPermission("sacherie", "mouvement"), auditMiddleware("sacherie", "CREATE", { entiteType: "mouvement_sacherie" }), createMouvementSacherie);

export default router;