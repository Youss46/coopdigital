import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { getMemberPdf, getMonthlyReport, getCampaignBilan } from "../controllers/rapportsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/rapports/membre/:id", checkPermission("reporting", "generer_fiche_membre"), getMemberPdf);
router.get("/rapports/mensuel/:mois/:an", checkPermission("reporting", "generer_rapport_mensuel"), getMonthlyReport);
router.get("/rapports/campagne/:annee", checkPermission("reporting", "generer_bilan_campagne"), getCampaignBilan);

export default router;
