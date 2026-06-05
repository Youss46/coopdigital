import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getConfigParts,
  updateConfigParts,
  getPartsMembre,
  enregistrerLiberation,
  getRapportParts,
} from "../controllers/partsSocialesController";

const router = Router();

router.get("/parts-sociales/config", checkPermission("parts_sociales", "lire"), getConfigParts);
router.put("/parts-sociales/config", checkPermission("parts_sociales", "configurer"), updateConfigParts);
router.get("/parts-sociales/rapport", checkPermission("parts_sociales", "lire"), getRapportParts);
router.get("/parts-sociales/membre/:id", checkPermission("parts_sociales", "lire"), getPartsMembre);
router.post("/parts-sociales/liberation", checkPermission("parts_sociales", "enregistrer_versement"), enregistrerLiberation);

export default router;
