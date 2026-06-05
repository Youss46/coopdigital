import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getCampagneActive,
  listCampagnes,
  getCampagne,
  createCampagne,
  fermerCampagne,
  verifierCampagne,
  cloturerCampagne,
  getBilan,
  getBilanPdf,
  getComparaison,
} from "../controllers/campagnesController";

const router = Router();

router.get("/campagnes/active",            checkPermission("campagnes", "lire"),      getCampagneActive);
router.get("/campagnes/comparaison",       checkPermission("campagnes", "lire"),      getComparaison);
router.get("/campagnes",                   checkPermission("campagnes", "lire"),      listCampagnes);
router.post("/campagnes",                  checkPermission("campagnes", "creer"),     createCampagne);
router.get("/campagnes/:id",               checkPermission("campagnes", "lire"),      getCampagne);
router.put("/campagnes/:id/fermer",        checkPermission("campagnes", "fermer"),    fermerCampagne);
router.get("/campagnes/:id/verifier",      checkPermission("campagnes", "verifier"),  verifierCampagne);
router.post("/campagnes/:id/cloture",      checkPermission("campagnes", "cloturer"),  cloturerCampagne);
router.get("/campagnes/:id/bilan",         checkPermission("campagnes", "voir_bilan"), getBilan);
router.get("/campagnes/:id/bilan-pdf",     checkPermission("campagnes", "voir_bilan"), getBilanPdf);

export default router;
