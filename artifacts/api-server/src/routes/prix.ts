import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getPrixActuel,
  saisirPrix,
  getHistorique,
  getAnalyseMarge,
  getComparaison,
  getTendance,
  updateConfig,
  getConfig,
  getAlertes,
  marquerAlerteLue,
  diffuserSMS,
  getSimulation,
} from "../controllers/prixController";

const router = Router();

router.get( "/prix/actuel",          authMiddleware, checkPermission("prix","voir"),          getPrixActuel);
router.post("/prix",                 authMiddleware, checkPermission("prix","saisir_prix"),    saisirPrix);
router.get( "/prix/historique",      authMiddleware, checkPermission("prix","voir"),          getHistorique);
router.get( "/prix/analyse-marge",   authMiddleware, checkPermission("prix","voir_analyse"),  getAnalyseMarge);
router.get( "/prix/comparaison",     authMiddleware, checkPermission("prix","voir"),          getComparaison);
router.get( "/prix/tendance",        authMiddleware, checkPermission("prix","voir"),          getTendance);
router.get( "/prix/config",          authMiddleware, checkPermission("prix","voir"),          getConfig);
router.put( "/prix/config",          authMiddleware, checkPermission("prix","configurer"),    updateConfig);
router.get( "/prix/alertes",         authMiddleware, checkPermission("prix","voir"),          getAlertes);
router.put( "/prix/alertes/:id/lu",  authMiddleware, checkPermission("prix","voir"),          marquerAlerteLue);
router.post("/prix/diffuser-sms",    authMiddleware, checkPermission("prix","diffuser_sms"),  diffuserSMS);
router.get( "/prix/simulation",      authMiddleware, checkPermission("prix","voir_analyse"),  getSimulation);

export default router;
