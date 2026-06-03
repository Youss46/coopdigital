import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getEntrepots,
  getMouvements,
  entreeStock,
  sortieStock,
  getAlertes,
} from "../controllers/stocksController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/stocks/entrepots", getEntrepots);
router.get("/stocks/mouvements", getMouvements);
router.post("/stocks/entree", entreeStock);
router.post("/stocks/sortie", sortieStock);
router.get("/stocks/alertes", getAlertes);

export default router;
