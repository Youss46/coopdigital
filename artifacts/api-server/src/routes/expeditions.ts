import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  handleListExpeditions,
  handleGetStats,
  handleGetExpedition,
  handleCreateExpedition,
  handleChangerStatut,
  handleConfirmerReception,
  handleRapportEudr,
} from "../controllers/expeditionsController";

const router = Router();

router.get(
  "/expeditions",
  checkPermission("expeditions", "lire"),
  handleListExpeditions,
);

router.get(
  "/expeditions/stats",
  checkPermission("expeditions", "lire"),
  handleGetStats,
);

router.post(
  "/expeditions",
  checkPermission("expeditions", "creer"),
  handleCreateExpedition,
);

router.get(
  "/expeditions/:id",
  checkPermission("expeditions", "lire"),
  handleGetExpedition,
);

router.put(
  "/expeditions/:id/statut",
  checkPermission("expeditions", "modifier"),
  handleChangerStatut,
);

router.put(
  "/expeditions/:id/reception",
  checkPermission("expeditions", "modifier"),
  handleConfirmerReception,
);

router.get(
  "/expeditions/:id/eudr",
  checkPermission("expeditions", "rapport_eudr"),
  handleRapportEudr,
);

export default router;
