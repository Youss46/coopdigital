/**
 * Routes publiques pour l'espace station-service.
 * Aucun authMiddleware ici : le numéro de bon unique sert de jeton.
 */
import { Router, type IRouter } from "express";
import {
  handleVerifierBonStation,
  handleLivrerBonStation,
} from "../controllers/stationController";

const router: IRouter = Router();

// Vérifier un bon (lecture seule — la station voit les infos du bon)
router.get("/station/carburant/bons/:numero", handleVerifierBonStation);

// Enregistrer la délivrance (la station confirme le service)
router.put("/station/carburant/bons/:numero/livrer", handleLivrerBonStation);

export default router;
