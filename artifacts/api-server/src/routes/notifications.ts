import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getNotifications,
  getNotificationsCount,
  marquerLue,
  marquerToutLu,
  supprimerNotification,
  getPreferences,
  updatePreferences,
} from "../controllers/notificationsController";

const router = Router();

router.get("/notifications/count",          authMiddleware, getNotificationsCount);
router.get("/notifications/preferences",    authMiddleware, getPreferences);
router.put("/notifications/preferences",    authMiddleware, updatePreferences);
router.get("/notifications",                authMiddleware, getNotifications);
router.put("/notifications/tout-lire",      authMiddleware, marquerToutLu);
router.put("/notifications/:id/lire",       authMiddleware, marquerLue);
router.delete("/notifications/:id",         authMiddleware, supprimerNotification);

export default router;
