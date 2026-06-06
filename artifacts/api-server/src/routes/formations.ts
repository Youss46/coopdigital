import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/formationController.js";

const router = Router();

// ─── Stats globales ────────────────────────────────────────────────────────
router.get("/formations/stats",                      checkPermission("formation", "voir_stats"),        ctrl.getStats);

// ─── Attestations — liste ──────────────────────────────────────────────────
router.get("/formations/attestations",               checkPermission("formation", "voir"),              ctrl.getListeAttestations);

// ─── Stats membre ──────────────────────────────────────────────────────────
router.get("/formations/membre/:membreId",           checkPermission("formation", "voir"),              ctrl.getStatsMembre);

// ─── Programmes CRUD ──────────────────────────────────────────────────────
router.get("/formations/programmes",                 checkPermission("formation", "voir"),              ctrl.getProgrammes);
router.post("/formations/programmes",                checkPermission("formation", "planifier"),         ctrl.postProgramme);
router.put("/formations/programmes/:id",             checkPermission("formation", "planifier"),         ctrl.putProgramme);
router.delete("/formations/programmes/:id",          checkPermission("formation", "planifier"),         ctrl.deleteProgramme);

// ─── Sessions CRUD ────────────────────────────────────────────────────────
router.get("/formations/sessions",                   checkPermission("formation", "voir"),              ctrl.getSessions);
router.post("/formations/sessions",                  checkPermission("formation", "planifier"),         ctrl.postSession);
router.put("/formations/sessions/:id",               checkPermission("formation", "planifier"),         ctrl.putSession);

// ─── Inscriptions ─────────────────────────────────────────────────────────
router.get("/formations/sessions/:id/inscrits",      checkPermission("formation", "voir"),              ctrl.getInscrits);
router.post("/formations/sessions/:id/inscrire",     checkPermission("formation", "inscrire"),          ctrl.postInscrire);
router.delete("/formations/sessions/:id/inscrits/:membreId", checkPermission("formation", "inscrire"), ctrl.deleteInscription);

// ─── Présences ────────────────────────────────────────────────────────────
router.put("/formations/sessions/:id/presence",      checkPermission("formation", "gerer_presences"),   ctrl.putPresences);

// ─── SMS ──────────────────────────────────────────────────────────────────
router.post("/formations/sessions/:id/convoquer",    checkPermission("formation", "inscrire"),          ctrl.postConvoquer);
router.post("/formations/sessions/:id/rappel",       checkPermission("formation", "inscrire"),          ctrl.postRappel);

// ─── Attestations par session ──────────────────────────────────────────────
router.post("/formations/sessions/:id/attestations",           checkPermission("formation", "generer_attestation"), ctrl.postAttestations);
router.get("/formations/sessions/:id/attestation/:membreId",   checkPermission("formation", "voir"),               ctrl.getAttestation);

export default router;
