import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getAnomalies,
  getStatsAnomalies,
  traiter,
  getConfig,
  putConfig,
} from "../controllers/anomalieController";

const router = Router();

router.get("/anomalies/stats",       authMiddleware, getStatsAnomalies);
router.get("/anomalies/config",      authMiddleware, getConfig);
router.put("/anomalies/config",      authMiddleware, putConfig);
router.get("/anomalies",             authMiddleware, getAnomalies);
router.put("/anomalies/:id/traiter", authMiddleware, traiter);

export default router;
