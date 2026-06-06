import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/fiscaliteController.js";

const router = Router();

router.get("/fiscalite/obligations",             checkPermission("fiscalite", "voir"),       ctrl.getObligations);
router.post("/fiscalite/generer/:mois/:annee",   checkPermission("fiscalite", "generer"),    ctrl.postGenererMensuel);
router.post("/fiscalite/generer-annuel/:annee",  checkPermission("fiscalite", "generer"),    ctrl.postGenererAnnuel);
router.get("/fiscalite/declarations",            checkPermission("fiscalite", "voir"),       ctrl.getDeclarations);
router.put("/fiscalite/declarations/:id/payer",  checkPermission("fiscalite", "payer"),      ctrl.putPayer);
router.get("/fiscalite/calendrier",              checkPermission("fiscalite", "voir"),       ctrl.getCalendrier);
router.get("/fiscalite/alertes",                 checkPermission("fiscalite", "voir"),       ctrl.getAlertes);
router.get("/fiscalite/rapport-annuel",          checkPermission("fiscalite", "voir"),       ctrl.getRapportAnnuel);
router.get("/fiscalite/rapport-pdf",             checkPermission("fiscalite", "voir"),       ctrl.getRapportPdf);

export default router;
