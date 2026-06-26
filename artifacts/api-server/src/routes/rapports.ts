import { Router, type IRouter } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getMemberPdf,
  getMonthlyReport,
  getCampaignBilan,
  getBilanOHADAPdf,
  getCompteResultatOHADAPdf,
  getFluxTresoreiriePdf,
  getRecuLivraison,
  getRecuPaiement,
  getBulletinPaie,
  getBordereauPesee,
  getRecuAvance,
  getRecuIntrant,
  getEtatPartsSociales,
} from "../controllers/rapportsController";

const router: IRouter = Router();

router.get("/rapports/membre/:id",                     checkPermission("reporting", "generer_fiche_membre"),     getMemberPdf);
router.get("/rapports/mensuel/:mois/:an",              checkPermission("reporting", "generer_rapport_mensuel"),  getMonthlyReport);
router.get("/rapports/campagne/:annee",                checkPermission("reporting", "generer_bilan_campagne"),   getCampaignBilan);
router.get("/rapports/etats-financiers/bilan",           checkPermission("reporting", "voir_etats_financiers"), getBilanOHADAPdf);
router.get("/rapports/etats-financiers/compte-resultat", checkPermission("reporting", "voir_etats_financiers"), getCompteResultatOHADAPdf);
router.get("/rapports/etats-financiers/flux-tresorerie", checkPermission("reporting", "voir_etats_financiers"), getFluxTresoreiriePdf);

router.get("/rapports/recu/livraison/:id",  checkPermission("reporting", "generer_recu"),  getRecuLivraison);
router.get("/rapports/recu/paiement/:id",   checkPermission("reporting", "generer_recu"),  getRecuPaiement);
router.get("/rapports/recu/bulletin/:id",   checkPermission("reporting", "generer_recu"),  getBulletinPaie);
router.get("/rapports/recu/pesee/:id",      checkPermission("reporting", "generer_recu"),  getBordereauPesee);
router.get("/rapports/recu/avance/:id",     checkPermission("reporting", "generer_recu"),  getRecuAvance);
router.get("/rapports/recu/intrant/:id",    checkPermission("reporting", "generer_recu"),  getRecuIntrant);
router.get("/rapports/recu/parts/:id",      checkPermission("reporting", "generer_recu"),  getEtatPartsSociales);

export default router;
