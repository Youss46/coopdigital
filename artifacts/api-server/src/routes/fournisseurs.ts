import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listFournisseurs,
  searchFournisseurs,
  getFournisseurById,
  createFournisseur,
  createFournisseurDepuisMembre,
  updateFournisseur,
  getRapportTypeFournisseur,
} from "../controllers/fournisseursController";

const router = Router();

router.get("/fournisseurs/search", checkPermission("fournisseurs", "lire"), searchFournisseurs);
router.get("/fournisseurs/rapport-type", checkPermission("fournisseurs", "lire"), getRapportTypeFournisseur);
router.get("/fournisseurs", checkPermission("fournisseurs", "lire"), listFournisseurs);
router.get("/fournisseurs/:id", checkPermission("fournisseurs", "lire"), getFournisseurById);
router.post("/fournisseurs/depuis-membre/:id", checkPermission("fournisseurs", "creer"), createFournisseurDepuisMembre);
router.post("/fournisseurs", checkPermission("fournisseurs", "creer"), createFournisseur);
router.put("/fournisseurs/:id", checkPermission("fournisseurs", "modifier"), updateFournisseur);

export default router;
