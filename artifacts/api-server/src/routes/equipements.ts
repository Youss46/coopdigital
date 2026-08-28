import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permissions.js";
import {
  getCategoriesEquipements,
  getEquipements, postEquipement,
  getEquipementsByCategorie,
  getEquipementsAlertes, getEquipementsAmortis,
  getRapportInventaire, postGenererDotations,
  getEquipementById, putEquipement, deleteEquipement,
  getTableauAmortissement,
  getMaintenances, postMaintenance,
} from "../controllers/equipementsController.js";

const router = Router();
router.use(authMiddleware);

router.get("/categories-equipements", checkPermission("equipements", "lire"), getCategoriesEquipements);

// Routes spécifiques AVANT les routes paramétrées
router.get("/equipements/amortis", checkPermission("equipements", "lire"), getEquipementsAmortis);
router.get("/equipements/alertes", checkPermission("equipements", "lire"), getEquipementsAlertes);
router.get("/equipements/rapport-inventaire", checkPermission("equipements", "lire"), getRapportInventaire);
router.post("/equipements/generer-dotations", checkPermission("equipements", "generer_dotations"), postGenererDotations);
router.get("/equipements/categorie/:id", checkPermission("equipements", "lire"), getEquipementsByCategorie);

// CRUD
router.get("/equipements", checkPermission("equipements", "lire"), getEquipements);
router.post("/equipements", checkPermission("equipements", "creer"), postEquipement);
router.get("/equipements/:id", checkPermission("equipements", "lire"), getEquipementById);
router.put("/equipements/:id", checkPermission("equipements", "modifier"), putEquipement);
router.delete("/equipements/:id", checkPermission("equipements", "supprimer"), deleteEquipement);

// Sous-ressources
router.get("/equipements/:id/tableau-amortissement", checkPermission("equipements", "lire"), getTableauAmortissement);
router.get("/equipements/:id/maintenances", checkPermission("equipements", "lire"), getMaintenances);
router.post("/equipements/:id/maintenance", checkPermission("equipements", "maintenance"), postMaintenance);

export default router;
