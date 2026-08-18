import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import {
  creerBonHandler,
  listerBonsHandler,
  detailBonHandler,
  annulerBonHandler,
} from "../controllers/bonReceptionController.js";

const router = Router();

// Magasinier crée le bon le jour J
router.post("/pesee/bons-reception",      checkPermission("stocks", "entree"), creerBonHandler);
// Liste des bons (magasinier + peseur)
router.get("/pesee/bons-reception",       checkPermission("stocks", "lire"),   listerBonsHandler);
// Détail d'un bon
router.get("/pesee/bons-reception/:id",   checkPermission("stocks", "lire"),   detailBonHandler);
// Annulation
router.delete("/pesee/bons-reception/:id", checkPermission("stocks", "entree"), annulerBonHandler);

export default router;
