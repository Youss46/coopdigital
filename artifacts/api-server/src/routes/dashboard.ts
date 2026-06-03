import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getDashboard,
  getDashboardLivraisons,
  getDashboardAvancesRetard,
} from "../controllers/dashboardController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/dashboard", getDashboard);
router.get("/dashboard/livraisons", getDashboardLivraisons);
router.get("/dashboard/avances-retard", getDashboardAvancesRetard);

export default router;
