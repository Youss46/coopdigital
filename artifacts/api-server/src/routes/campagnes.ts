import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getCampagneActive,
  listCampagnes,
  createCampagne,
  fermerCampagne,
} from "../controllers/campagnesController";

const router = Router();

router.get("/campagnes/active", checkPermission("campagnes", "lire"), getCampagneActive);
router.get("/campagnes", checkPermission("campagnes", "lire"), listCampagnes);
router.post("/campagnes", checkPermission("campagnes", "creer"), createCampagne);
router.put("/campagnes/:id/fermer", checkPermission("campagnes", "fermer"), fermerCampagne);

export default router;
