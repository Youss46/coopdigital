import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import * as ctrl from "../controllers/scoringController";

const router = Router();

router.get("/scoring/config",                  authMiddleware, ctrl.getConfig);
router.put("/scoring/config",                  authMiddleware, ctrl.updateConfig);
router.get("/scoring/campagne/:id",            authMiddleware, ctrl.getClassementCampagne);
router.get("/scoring/top",                     authMiddleware, ctrl.getTopN);
router.get("/scoring/par-niveau",              authMiddleware, ctrl.getParNiveau);
router.get("/scoring/evolution/:membreId",     authMiddleware, ctrl.getEvolution);
router.get("/scoring/resume/:membreId",        authMiddleware, ctrl.getResumeMembre);
router.get("/scoring/membre/:id",              authMiddleware, ctrl.getScoreMembre);
router.post("/scoring/recalculer",             authMiddleware, ctrl.recalculerScores);

export default router;
