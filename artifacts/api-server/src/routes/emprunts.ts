import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listPreteurs,
  createPreteur,
  listEmprunts,
  getEmpruntById,
  createEmprunt,
  getEcheancier,
  previewEcheancier,
  enregistrerRemboursement,
  getAlertes,
  getDashboard,
} from "../controllers/empruntsController";

const router = Router();

// Dashboard
router.get("/emprunts/dashboard", checkPermission("emprunts", "voir"), getDashboard);

// Alertes (échéances dans les 30 jours)
router.get("/emprunts/alertes", checkPermission("emprunts", "voir"), getAlertes);

// Prêteurs
router.get("/emprunts/preteurs", checkPermission("emprunts", "voir"), listPreteurs);
router.post("/emprunts/preteurs", checkPermission("emprunts", "creer"), createPreteur);

// Aperçu échéancier (sans persistance)
router.post("/emprunts/preview-echeancier", checkPermission("emprunts", "voir"), previewEcheancier);

// Emprunts
router.get("/emprunts", checkPermission("emprunts", "voir"), listEmprunts);
router.post("/emprunts", checkPermission("emprunts", "creer"), createEmprunt);
router.get("/emprunts/:id", checkPermission("emprunts", "voir"), getEmpruntById);
router.get("/emprunts/:id/echeancier", checkPermission("emprunts", "voir"), getEcheancier);
router.post("/emprunts/:id/rembourser", checkPermission("emprunts", "rembourser"), enregistrerRemboursement);

export default router;
