import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getBilan,
  getCompteResultat,
  getFluxTresorerie,
  getMargeCampagnes,
} from "../controllers/etatsFinanciersController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/etats-financiers/bilan", checkPermission("comptabilite", "voir_bilan"), getBilan);
router.get("/etats-financiers/compte-resultat", checkPermission("comptabilite", "voir_compte_resultat"), getCompteResultat);
router.get("/etats-financiers/flux-tresorerie", checkPermission("comptabilite", "lire"), getFluxTresorerie);
router.get("/etats-financiers/marge-par-campagne", checkPermission("comptabilite", "lire"), getMargeCampagnes);

export default router;
