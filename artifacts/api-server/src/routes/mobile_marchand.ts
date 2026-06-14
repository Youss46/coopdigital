import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/mobileMarchandController.js";

const router = Router();

router.get("/mobile-marchand",               checkPermission("mobile_marchand", "voir"),           ctrl.getComptes);
router.post("/mobile-marchand",              checkPermission("mobile_marchand", "creer"),          ctrl.postCompte);
router.put("/mobile-marchand/:id",           checkPermission("mobile_marchand", "creer"),          ctrl.putCompte);
router.get("/mobile-marchand/:id/journal",   checkPermission("mobile_marchand", "voir"),           ctrl.getJournal);
router.post("/mobile-marchand/:id/mouvement",checkPermission("mobile_marchand", "enregistrer_mvt"),ctrl.postMouvement);

export default router;
