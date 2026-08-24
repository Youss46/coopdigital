import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/fiscaliteController.js";

const router = Router();

// ── Obligations (static routes before dynamic :id) ─────────────────────────
router.get("/fiscalite/obligations/all",         checkPermission("fiscalite", "voir"),       ctrl.getAllObligations);
router.get("/fiscalite/obligations",             checkPermission("fiscalite", "voir"),       ctrl.getObligations);
router.post("/fiscalite/obligations/init-ci",    checkPermission("fiscalite", "configurer"),  ctrl.postInitObligationsCI);
router.post("/fiscalite/obligations",            checkPermission("fiscalite", "configurer"),  ctrl.postObligation);
router.put("/fiscalite/obligations/:id",         checkPermission("fiscalite", "configurer"),  ctrl.putObligation);
router.patch("/fiscalite/obligations/:id/toggle",checkPermission("fiscalite", "configurer"),  ctrl.patchObligationToggle);

// ── Déclarations ───────────────────────────────────────────────────────────
router.post("/fiscalite/generer/:mois/:annee",   checkPermission("fiscalite", "generer"),    ctrl.postGenererMensuel);
router.post("/fiscalite/generer-annuel/:annee",  checkPermission("fiscalite", "generer"),    ctrl.postGenererAnnuel);
router.get("/fiscalite/declarations",            checkPermission("fiscalite", "voir"),       ctrl.getDeclarations);
router.get("/fiscalite/ppsi/export/:mois/:annee",checkPermission("fiscalite", "voir"),       ctrl.getExportPpsi);
router.get("/fiscalite/ppsi/export-pdf/:mois/:annee",checkPermission("fiscalite", "voir"),    ctrl.getExportPpsiPdf);
router.put("/fiscalite/declarations/:id/payer",      checkPermission("fiscalite", "payer"),    ctrl.putPayer);
router.put("/fiscalite/declarations/:id/recalculer", checkPermission("fiscalite", "generer"), ctrl.putRecalculer);
router.delete("/fiscalite/declarations/:id",         checkPermission("fiscalite", "generer"), ctrl.deleteDeclaration);
router.get("/fiscalite/calendrier",              checkPermission("fiscalite", "voir"),       ctrl.getCalendrier);
router.get("/fiscalite/alertes",                 checkPermission("fiscalite", "voir"),       ctrl.getAlertes);
router.get("/fiscalite/rapport-annuel",          checkPermission("fiscalite", "voir"),       ctrl.getRapportAnnuel);
router.get("/fiscalite/rapport-pdf",             checkPermission("fiscalite", "voir"),       ctrl.getRapportPdf);
router.get("/fiscalite/bordereau-cnps-pdf/:mois/:annee", checkPermission("fiscalite", "voir"), ctrl.getBordereauCnpsPdf);

export default router;
