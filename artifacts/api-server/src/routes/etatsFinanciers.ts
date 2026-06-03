import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getBilan,
  getCompteResultat,
  getFluxTresorerie,
  getMargeCampagnes,
} from "../controllers/etatsFinanciersController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/etats-financiers/bilan", getBilan);
router.get("/etats-financiers/compte-resultat", getCompteResultat);
router.get("/etats-financiers/flux-tresorerie", getFluxTresorerie);
router.get("/etats-financiers/marge-par-campagne", getMargeCampagnes);

export default router;
