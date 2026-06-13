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
  verifierMembreHandler,
  getVapidKeyPortailHandler,
  subscribePushPortailHandler,
  unsubscribePushPortailHandler,
  getNotificationsPortailHandler,
  marquerLuPortailHandler,
  marquerToutLuPortailHandler,
} from "../controllers/portailController";

const router = Router();

router.get("/portail/verifier/:code", verifierMembreHandler);
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

// ── Notifications in-app ──────────────────────────────────────────────────────
router.get("/portail/notifications",              portailAuthMiddleware, getNotificationsPortailHandler);
router.patch("/portail/notifications/tout-lu",    portailAuthMiddleware, marquerToutLuPortailHandler);
router.patch("/portail/notifications/:id/lu",     portailAuthMiddleware, marquerLuPortailHandler);

// ── Notifications push ────────────────────────────────────────────────────────
router.get("/portail/push/vapid-key",           getVapidKeyPortailHandler);
router.post("/portail/push/subscribe",   portailAuthMiddleware, subscribePushPortailHandler);
router.delete("/portail/push/subscribe", portailAuthMiddleware, unsubscribePushPortailHandler);

export default router;
