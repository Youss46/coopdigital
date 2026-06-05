import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
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

router.get("/categories-equipements", getCategoriesEquipements);

// Routes spécifiques AVANT les routes paramétrées
router.get("/equipements/amortis", getEquipementsAmortis);
router.get("/equipements/alertes", getEquipementsAlertes);
router.get("/equipements/rapport-inventaire", getRapportInventaire);
router.post("/equipements/generer-dotations", postGenererDotations);
router.get("/equipements/categorie/:id", getEquipementsByCategorie);

// CRUD
router.get("/equipements", getEquipements);
router.post("/equipements", postEquipement);
router.get("/equipements/:id", getEquipementById);
router.put("/equipements/:id", putEquipement);
router.delete("/equipements/:id", deleteEquipement);

// Sous-ressources
router.get("/equipements/:id/tableau-amortissement", getTableauAmortissement);
router.get("/equipements/:id/maintenances", getMaintenances);
router.post("/equipements/:id/maintenance", postMaintenance);

export default router;
