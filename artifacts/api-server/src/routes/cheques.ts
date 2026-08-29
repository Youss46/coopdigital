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

router.get ("/cheques-recus",             checkPermission("cheques", "lire"),      ctrl.getChequesRecus);
router.post("/cheques-recus",             checkPermission("cheques", "creer"),     ctrl.postCreerRecu);
router.post("/cheques-recus/:id/deposer", checkPermission("cheques", "modifier"),  ctrl.postDeposerRecu);
router.post("/cheques-recus/:id/encaisser", checkPermission("cheques", "encaisser"), ctrl.postEncaisserRecu);
router.post("/cheques-recus/:id/rejeter", checkPermission("cheques", "rejeter"), ctrl.postRejeterRecu);
router.post("/cheques-recus/:id/annuler", checkPermission("cheques", "annuler"), ctrl.postAnnulerRecu);

export default router;
