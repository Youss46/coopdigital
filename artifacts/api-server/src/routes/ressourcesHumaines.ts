import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/ressourcesHumainesController.js";

const router = Router();
router.use(authMiddleware);

router.get("/rh/dashboard", checkPermission("rh", "lire"), ctrl.getRhDashboard);
router.get("/rh/alertes", checkPermission("rh", "lire"), ctrl.getRhAlertes);
router.get("/rh/personnel", checkPermission("rh", "lire"), ctrl.listRhPersonnel);
router.get("/rh/utilisateurs", checkPermission("rh", "lire"), ctrl.listRhUserOptions);
router.get("/rh/personnel/:id", checkPermission("rh", "lire"), ctrl.getRhPersonnel);
router.put("/rh/personnel/:id", checkPermission("rh", "modifier_dossier"), ctrl.updateRhPersonnel);

router.get("/rh/contrats", checkPermission("rh", "lire"), ctrl.listRhContrats);
router.post("/rh/contrats", checkPermission("rh", "gerer_contrats"), ctrl.createRhContrat);
router.put("/rh/contrats/:id", checkPermission("rh", "gerer_contrats"), ctrl.updateRhContrat);

router.get("/rh/documents", checkPermission("rh", "lire"), ctrl.listRhDocuments);
router.post("/rh/documents", checkPermission("rh", "gerer_documents"), ctrl.createRhDocument);
router.put("/rh/documents/:id", checkPermission("rh", "gerer_documents"), ctrl.updateRhDocument);

router.get("/rh/conges", checkPermission("rh", "lire"), ctrl.listRhConges);
router.post("/rh/conges", checkPermission("rh", "demander_conge"), ctrl.createRhConge);
router.post("/rh/conges/:id/decision", checkPermission("rh", "valider_conge"), ctrl.decideRhConge);

router.get("/rh/absences", checkPermission("rh", "lire"), ctrl.listRhAbsences);
router.post("/rh/absences", checkPermission("rh", "gerer_absences"), ctrl.createRhAbsence);
router.put("/rh/absences/:id", checkPermission("rh", "gerer_absences"), ctrl.updateRhAbsence);

export default router;