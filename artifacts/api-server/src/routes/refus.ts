import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listRefus,
  getStatsRefus,
  traiterRefus,
  countRefusEnAttente,
  getConstatRefoulementPdf,
} from "../controllers/refusController";

const router = Router();

router.get("/refus/count", checkPermission("refus", "lire"), countRefusEnAttente);
router.get("/refus/stats", checkPermission("refus", "lire"), getStatsRefus);
router.get("/refus", checkPermission("refus", "lire"), listRefus);
router.put("/refus/:id/traiter", checkPermission("refus", "traiter"), traiterRefus);
router.get("/refus/:id/constat-pdf", checkPermission("refus", "lire"), getConstatRefoulementPdf);

export default router;
