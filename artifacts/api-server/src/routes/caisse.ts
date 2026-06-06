import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/caisseController.js";

const router = Router();

// ─── Soldes & Alertes (globaux) ───────────────────────────────────────────────
router.get("/caisse/soldes",              checkPermission("caisse", "voir"),          ctrl.getSoldes);
router.get("/caisse/alertes",             checkPermission("caisse", "voir_alertes"),  ctrl.getAlertes);

// ─── CRUD Caisses ─────────────────────────────────────────────────────────────
router.get("/caisse",                     checkPermission("caisse", "voir"),          ctrl.getCaisses);
router.post("/caisse",                    checkPermission("caisse", "creer_caisse"),  ctrl.postCaisse);
router.put("/caisse/:id",                 checkPermission("caisse", "creer_caisse"),  ctrl.putCaisse);

// ─── Session active ───────────────────────────────────────────────────────────
router.get("/caisse/:id/session-active",  checkPermission("caisse", "voir"),          ctrl.getSessionActive);
router.get("/caisse/:id/sessions",        checkPermission("caisse", "voir"),          ctrl.getSessions);

// ─── Ouvrir / Fermer ──────────────────────────────────────────────────────────
router.post("/caisse/:id/ouvrir",         checkPermission("caisse", "ouvrir_session"), ctrl.postOuvrir);
router.put("/caisse/:id/fermer",          checkPermission("caisse", "fermer_session"), ctrl.putFermer);

// ─── Mouvements ───────────────────────────────────────────────────────────────
router.post("/caisse/:id/mouvement",      checkPermission("caisse", "enregistrer_mvt"), ctrl.postMouvement);
router.post("/caisse/:id/transfert",      checkPermission("caisse", "fermer_session"),  ctrl.postTransfert);

// ─── Journal & PDF ────────────────────────────────────────────────────────────
router.get("/caisse/:id/journal",         checkPermission("caisse", "voir"),          ctrl.getJournal);
router.get("/caisse/:id/rapport-pdf",     checkPermission("caisse", "voir"),          ctrl.getRapportPdf);

export default router;
