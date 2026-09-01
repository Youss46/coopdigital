import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { checkPermission, checkSacheriePermission } from "../middlewares/permissions.js";
import { auditMiddleware } from "../middlewares/auditMiddleware.js";
import {
  createMouvementSacherie,
  createTypeSac,
  getSacherieConfig,
  getResumeSacherie,
  listMembresSacherie,
  listMouvementsSacherie,
  listTypesSacs,
  updateTypeSac,
} from "../controllers/sacherieController.js";

const router = Router();

router.use("/sacherie", authMiddleware);
router.get("/sacherie/resume", checkPermission("sacherie", "lire"), getResumeSacherie);
router.get("/sacherie/config", checkPermission("sacherie", "lire"), getSacherieConfig);
router.get("/sacherie/types", checkPermission("sacherie", "lire"), listTypesSacs);
router.post("/sacherie/types", checkSacheriePermission("gerer_types"), auditMiddleware("sacherie", "CREATE", { entiteType: "type_sac" }), createTypeSac);
router.patch("/sacherie/types/:id", checkSacheriePermission("gerer_types"), auditMiddleware("sacherie", "UPDATE", { entiteIdParam: "id", entiteType: "type_sac" }), updateTypeSac);
router.get("/sacherie/membres", checkPermission("sacherie", "lire"), listMembresSacherie);
router.get("/sacherie/mouvements", checkPermission("sacherie", "lire"), listMouvementsSacherie);
router.post("/sacherie/mouvements", checkSacheriePermission("mouvement"), auditMiddleware("sacherie", "CREATE", { entiteType: "mouvement_sacherie" }), createMouvementSacherie);

export default router;