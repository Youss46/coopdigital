import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/planningController.js";

const router = Router();

// ─── Statistiques ──────────────────────────────────────────────────────────
router.get("/planning-collecte/stats",          checkPermission("planning_collecte", "voir"), ctrl.getStatsPlannings);

// ─── Planning semaine ──────────────────────────────────────────────────────
router.get("/planning-collecte/semaine",        checkPermission("planning_collecte", "voir"), ctrl.getPlanningsSemaine);

// ─── Stats zones (avant /:id pour éviter le conflit) ──────────────────────
router.get("/planning-collecte/zones/stats",    checkPermission("planning_collecte", "voir"), ctrl.getStatsZones);

// ─── CRUD zones ────────────────────────────────────────────────────────────
router.get("/planning-collecte/zones",          checkPermission("planning_collecte", "voir"),         ctrl.getZones);
router.post("/planning-collecte/zones",         checkPermission("planning_collecte", "gerer_zones"),  ctrl.postZone);
router.put("/planning-collecte/zones/:id",      checkPermission("planning_collecte", "gerer_zones"),  ctrl.putZone);
router.delete("/planning-collecte/zones/:id",   checkPermission("planning_collecte", "gerer_zones"),  ctrl.deleteZone);

// ─── CRUD plannings ────────────────────────────────────────────────────────
router.get("/planning-collecte",                checkPermission("planning_collecte", "voir"),         ctrl.getPlannings);
router.post("/planning-collecte",               checkPermission("planning_collecte", "planifier"),    ctrl.postPlanning);
router.put("/planning-collecte/:id",            checkPermission("planning_collecte", "planifier"),    ctrl.putPlanning);

// ─── Actions plannings ─────────────────────────────────────────────────────
router.put("/planning-collecte/:id/demarrer",   checkPermission("planning_collecte", "terminer"),     ctrl.demarrerPlanning);
router.put("/planning-collecte/:id/terminer",   checkPermission("planning_collecte", "terminer"),     ctrl.terminerPlanning);
router.put("/planning-collecte/:id/annuler",    checkPermission("planning_collecte", "planifier"),    ctrl.annulerPlanning);
router.post("/planning-collecte/:id/notifier",  checkPermission("planning_collecte", "notifier_sms"), ctrl.notifierMembres);
router.get("/planning-collecte/:id/rapport",    checkPermission("planning_collecte", "voir"),         ctrl.getRapportPlanning);

export default router;
