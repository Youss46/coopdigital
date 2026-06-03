import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { getMemberPdf, getMonthlyReport, getCampaignBilan } from "../controllers/rapportsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/rapports/membre/:id", getMemberPdf);
router.get("/rapports/mensuel/:mois/:an", getMonthlyReport);
router.get("/rapports/campagne/:annee", getCampaignBilan);

export default router;
