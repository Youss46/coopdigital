import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listIntrants,
  getIntrantById,
  createIntrant,
  updateIntrant,
  getStockAlertes,
  listCategories,
  createAppro,
  createDistribution,
  getDistributionsMembre,
  getEncours,
  remboursementManuel,
  getRapportCampagne,
  getEncoursMemberApi,
} from "../controllers/intrantsController";

const router = Router();

// Catégories
router.get("/intrants/categories", checkPermission("intrants", "voir"), listCategories);

// Stock alertes
router.get("/intrants/stock-alerte", checkPermission("intrants", "voir"), getStockAlertes);

// Encours global
router.get("/intrants/encours", checkPermission("intrants", "voir"), getEncours);

// Encours membre
router.get("/intrants/encours/membre/:id", checkPermission("intrants", "voir"), getEncoursMemberApi);

// Rapport campagne
router.get("/intrants/rapport-campagne", checkPermission("intrants", "rapport"), getRapportCampagne);

// Historique distributions d'un membre
router.get("/intrants/distribution/membre/:id", checkPermission("intrants", "voir"), getDistributionsMembre);

// CRUD catalogue
router.get("/intrants", checkPermission("intrants", "voir"), listIntrants);
router.get("/intrants/:id", checkPermission("intrants", "voir"), getIntrantById);
router.post("/intrants", checkPermission("intrants", "creer"), createIntrant);
router.put("/intrants/:id", checkPermission("intrants", "modifier"), updateIntrant);

// Approvisionnement
router.post("/intrants/appro", checkPermission("intrants", "approvisionner"), createAppro);

// Distribution
router.post("/intrants/distribution", checkPermission("intrants", "distribuer"), createDistribution);

// Remboursement manuel
router.put("/intrants/remboursement", checkPermission("intrants", "rembourser"), remboursementManuel);

export default router;
