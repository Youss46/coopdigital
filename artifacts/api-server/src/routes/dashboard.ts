import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getDashboard,
  getDashboardLivraisons,
  getDashboardAvancesRetard,
  getDashboardTracabilite,
  getDashboardDelegue,
  getDeleguesPeseursCollectes,
  getDashboardTonnageCertif,
} from "../controllers/dashboardController";
import {
  requirePca,
  getSynthesePca,
  getAlertesPrioritairesPca,
  getComparaisonCampagnesPca,
} from "../controllers/pcaDashboardController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/dashboard", getDashboard);
router.get("/dashboard/livraisons", getDashboardLivraisons);
router.get("/dashboard/avances-retard", getDashboardAvancesRetard);
router.get("/dashboard/tracabilite", getDashboardTracabilite);
router.get("/dashboard/delegue", getDashboardDelegue);
router.get("/dashboard/peseurs-collectes", getDeleguesPeseursCollectes);
router.get("/dashboard/tonnage-certif", getDashboardTonnageCertif);

router.get("/dashboard/pca/synthese", requirePca, getSynthesePca);
router.get("/dashboard/pca/alertes-prioritaires", requirePca, getAlertesPrioritairesPca);
router.get("/dashboard/pca/comparaison-campagnes", requirePca, getComparaisonCampagnesPca);

export default router;
