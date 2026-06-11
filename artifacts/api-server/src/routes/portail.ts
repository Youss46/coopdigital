import { Router } from "express";
import { portailAuthMiddleware } from "../middlewares/portailAuth";
import {
  connexionPortail,
  getProfilHandler,
  getLivraisonsHandler,
  getAvancesHandler,
  getIntrantsHandler,
  getPartsSocialesHandler,
  getScoreHandler,
  getRecuLivraisonHandler,
  getCarteMembreHandler,
  savePhotoHandler,
} from "../controllers/portailController";

const router = Router();

router.post("/portail/connexion", connexionPortail);

router.get("/portail/profil",          portailAuthMiddleware, getProfilHandler);
router.get("/portail/livraisons",      portailAuthMiddleware, getLivraisonsHandler);
router.get("/portail/avances",         portailAuthMiddleware, getAvancesHandler);
router.get("/portail/intrants",        portailAuthMiddleware, getIntrantsHandler);
router.get("/portail/parts-sociales",  portailAuthMiddleware, getPartsSocialesHandler);
router.get("/portail/score",           portailAuthMiddleware, getScoreHandler);
router.get("/portail/recus/:livraison_id", portailAuthMiddleware, getRecuLivraisonHandler);
router.get("/portail/carte-membre",    portailAuthMiddleware, getCarteMembreHandler);
router.put("/portail/photo",           portailAuthMiddleware, savePhotoHandler);

export default router;
