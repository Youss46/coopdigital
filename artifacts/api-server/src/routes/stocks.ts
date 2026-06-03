import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getEntrepots,
  getMouvements,
  entreeStock,
  sortieStock,
  getAlertes,
} from "../controllers/stocksController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/stocks/entrepots", checkPermission("stocks", "lire"), getEntrepots);
router.get("/stocks/mouvements", checkPermission("stocks", "lire"), getMouvements);
router.post("/stocks/entree", checkPermission("stocks", "entree"), entreeStock);
router.post("/stocks/sortie", checkPermission("stocks", "sortie"), sortieStock);
router.get("/stocks/alertes", checkPermission("stocks", "voir_alertes"), getAlertes);

export default router;
