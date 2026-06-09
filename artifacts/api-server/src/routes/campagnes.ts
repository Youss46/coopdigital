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
  rattacherLivraisons,
} from "../controllers/campagnesController";
import { desactiverMembresSansCampagne } from "../controllers/membresController";

const router = Router();

router.get("/campagnes/active",            checkPermission("campagnes", "lire"),      getCampagneActive);
router.get("/campagnes/comparaison",       checkPermission("campagnes", "lire"),      getComparaison);
router.get("/campagnes",                   checkPermission("campagnes", "lire"),      listCampagnes);
router.post("/campagnes",                  checkPermission("campagnes", "creer"),     createCampagne);
router.get("/campagnes/:id",               checkPermission("campagnes", "lire"),      getCampagne);
router.put("/campagnes/:id/fermer",               checkPermission("campagnes", "fermer"),    fermerCampagne);
router.post("/campagnes/:id/desactiver-inactifs", checkPermission("campagnes", "fermer"),    desactiverMembresSansCampagne);
router.post("/campagnes/:id/rattacher-livraisons", checkPermission("campagnes", "fermer"),   rattacherLivraisons);
router.get("/campagnes/:id/verifier",      checkPermission("campagnes", "verifier"),  verifierCampagne);
router.post("/campagnes/:id/cloture",      checkPermission("campagnes", "cloturer"),  cloturerCampagne);
router.get("/campagnes/:id/bilan",         checkPermission("campagnes", "voir_bilan"), getBilan);
router.get("/campagnes/:id/bilan-pdf",     checkPermission("campagnes", "voir_bilan"), getBilanPdf);

export default router;
