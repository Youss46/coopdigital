import { Router } from "express";
import {
  getProjectionCampagne,
  postHypotheses,
  getTresorerie,
  postSimuler,
  getSimulations,
  getAlertes,
  getCampagnes,
} from "../controllers/previsionController.js";

const router = Router();

// Spécifiques d'abord
router.get("/previsions/alertes", getAlertes);
router.get("/previsions/tresorerie", getTresorerie);
router.get("/previsions/simulations", getSimulations);
router.post("/previsions/simuler", postSimuler);
router.get("/previsions/campagnes", getCampagnes);

// Paramétriques
router.get("/previsions/campagne/:id", getProjectionCampagne);
router.post("/previsions/campagne/:id/hypotheses", postHypotheses);

export default router;
