import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/banqueController.js";

const router = Router();

router.get("/banque/alertes",        checkPermission("banque", "voir"),           ctrl.getAlertes);
router.get("/banque",                checkPermission("banque", "voir"),           ctrl.getComptes);
router.post("/banque",               checkPermission("banque", "creer"),          ctrl.postCompte);
router.put("/banque/:id",            checkPermission("banque", "creer"),          ctrl.putCompte);
router.get("/banque/:id/journal",    checkPermission("banque", "voir"),           ctrl.getJournal);
router.post("/banque/:id/mouvement", checkPermission("banque", "enregistrer_mvt"), ctrl.postMouvement);
router.post("/banque/:id/rapprocher",checkPermission("banque", "rapprocher"),     ctrl.postRapprocher);

export default router;
