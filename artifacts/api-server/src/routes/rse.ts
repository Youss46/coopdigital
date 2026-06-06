import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getIndicateursHandler,
  calculerIndicateursHandler,
  getComparaisonHandler,
  getFormationsHandler,
  creerFormationHandler,
  getDistributionHandler,
  enregistrerEngagementsHandler,
  genererRapportPdfHandler,
} from "../controllers/rseController";

const router = Router();

router.get(  "/rse/indicateurs/:campagne_id",    checkPermission("rse", "voir"),              getIndicateursHandler);
router.post( "/rse/calculer/:campagne_id",        checkPermission("rse", "calculer"),          calculerIndicateursHandler);
router.get(  "/rse/comparaison",                  checkPermission("rse", "voir"),              getComparaisonHandler);
router.get(  "/rse/formations",                   checkPermission("rse", "voir"),              getFormationsHandler);
router.post( "/rse/formations",                   checkPermission("rse", "enregistrer_formation"), creerFormationHandler);
router.get(  "/rse/distribution/:campagne_id",    checkPermission("rse", "voir"),              getDistributionHandler);
router.patch("/rse/engagements/:campagne_id",      checkPermission("rse", "calculer"),          enregistrerEngagementsHandler);
router.get(  "/rse/rapport-pdf/:campagne_id",     checkPermission("rse", "generer_rapport"),   genererRapportPdfHandler);

export default router;
