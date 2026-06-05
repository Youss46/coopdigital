import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import * as ctrl from "../controllers/scoringController";

const router = Router();

router.get("/api/scoring/config",                  authMiddleware, ctrl.getConfig);
router.put("/api/scoring/config",                  authMiddleware, ctrl.updateConfig);
router.get("/api/scoring/campagne/:id",            authMiddleware, ctrl.getClassementCampagne);
router.get("/api/scoring/top",                     authMiddleware, ctrl.getTopN);
router.get("/api/scoring/par-niveau",              authMiddleware, ctrl.getParNiveau);
router.get("/api/scoring/evolution/:membreId",     authMiddleware, ctrl.getEvolution);
router.get("/api/scoring/resume/:membreId",        authMiddleware, ctrl.getResumeMembre);
router.get("/api/scoring/membre/:id",              authMiddleware, ctrl.getScoreMembre);
router.post("/api/scoring/recalculer",             authMiddleware, ctrl.recalculerScores);

export default router;
