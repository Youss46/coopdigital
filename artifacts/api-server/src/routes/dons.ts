import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import {
  getCategoriesHandler,
  getStatsDonsHandler,
  listerDonsHandler,
  creerDonHandler,
  getDonHandler,
  modifierDonHandler,
  validerDonHandler,
  annulerDonHandler,
  getPVRemiseHandler,
  getRapportDonsHandler,
  getDonsMembreHandler,
  listerProgrammesHandler,
  creerProgrammeHandler,
  cloturerProgrammeHandler,
} from "../controllers/donController.js";

const router = Router();

// Catégories
router.get("/dons/categories", checkPermission("dons", "voir"), getCategoriesHandler);

// Statistiques
router.get("/dons/stats",      checkPermission("dons", "voir_stats"), getStatsDonsHandler);

// Rapport PDF
router.get("/dons/rapport-pdf", checkPermission("dons", "rapport_ag"), getRapportDonsHandler);

// Dons d'un membre
router.get("/dons/membre/:membre_id", checkPermission("dons", "voir"), getDonsMembreHandler);

// Programmes (avant /:id pour éviter la capture paramétrée)
router.get("/dons/programmes",              checkPermission("dons", "voir"),             listerProgrammesHandler);
router.post("/dons/programmes",             checkPermission("dons", "gerer_programmes"), creerProgrammeHandler);
router.put("/dons/programmes/:id/cloturer", checkPermission("dons", "gerer_programmes"), cloturerProgrammeHandler);

// CRUD dons
router.get("/dons",             checkPermission("dons", "voir"),      listerDonsHandler);
router.post("/dons",            checkPermission("dons", "creer"),     creerDonHandler);
router.get("/dons/:id",         checkPermission("dons", "voir"),      getDonHandler);
router.put("/dons/:id",         checkPermission("dons", "modifier"),  modifierDonHandler);
router.put("/dons/:id/valider", checkPermission("dons", "valider"),   validerDonHandler);
router.put("/dons/:id/annuler", checkPermission("dons", "annuler"),   annulerDonHandler);
router.get("/dons/:id/pv-pdf",  checkPermission("dons", "generer_pv"), getPVRemiseHandler);

export default router;
