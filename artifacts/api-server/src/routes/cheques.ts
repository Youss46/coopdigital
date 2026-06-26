import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/chequesController.js";

const router = Router();

router.get ("/cheques",             checkPermission("cheques", "lire"),      ctrl.getCheques);
router.post("/cheques",             checkPermission("cheques", "creer"),     ctrl.postCheque);
router.put ("/cheques/:id",         checkPermission("cheques", "modifier"),  ctrl.putCheque);
router.post("/cheques/:id/encaisser", checkPermission("cheques", "encaisser"), ctrl.postEncaisser);
router.post("/cheques/:id/rejeter",   checkPermission("cheques", "rejeter"),   ctrl.postRejeter);
router.post("/cheques/:id/annuler",   checkPermission("cheques", "annuler"),   ctrl.postAnnuler);

export default router;
