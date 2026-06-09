import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getMemberPdf,
  getMonthlyReport,
  getCampaignBilan,
  getRecuLivraison,
  getRecuPaiement,
  getBulletinPaie,
  getBordereauPesee,
  getRecuAvance,
  getRecuIntrant,
  getEtatPartsSociales,
} from "../controllers/rapportsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/rapports/membre/:id",        checkPermission("reporting", "generer_fiche_membre"),     getMemberPdf);
router.get("/rapports/mensuel/:mois/:an", checkPermission("reporting", "generer_rapport_mensuel"),  getMonthlyReport);
router.get("/rapports/campagne/:annee",   checkPermission("reporting", "generer_bilan_campagne"),   getCampaignBilan);

router.get("/rapports/recu/livraison/:id",  checkPermission("reporting", "generer_recu"),  getRecuLivraison);
router.get("/rapports/recu/paiement/:id",   checkPermission("reporting", "generer_recu"),  getRecuPaiement);
router.get("/rapports/recu/bulletin/:id",   checkPermission("reporting", "generer_recu"),  getBulletinPaie);
router.get("/rapports/recu/pesee/:id",      checkPermission("reporting", "generer_recu"),  getBordereauPesee);
router.get("/rapports/recu/avance/:id",     checkPermission("reporting", "generer_recu"),  getRecuAvance);
router.get("/rapports/recu/intrant/:id",    checkPermission("reporting", "generer_recu"),  getRecuIntrant);
router.get("/rapports/recu/parts/:id",      checkPermission("reporting", "generer_recu"),  getEtatPartsSociales);

export default router;
