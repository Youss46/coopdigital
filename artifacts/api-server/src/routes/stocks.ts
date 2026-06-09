import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import {
  getEntrepots,
  getMouvements,
  entreeStock,
  sortieStock,
  getAlertes,
  createEntrepot,
  getLotissementStats,
} from "../controllers/stocksController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/stocks/entrepots", checkPermission("stocks", "lire"), getEntrepots);
router.post("/stocks/entrepots", checkPermission("stocks", "entree"), auditMiddleware("stocks", "CREATE", { entiteType: "entrepot" }), createEntrepot);
router.get("/stocks/mouvements", checkPermission("stocks", "lire"), getMouvements);
router.post("/stocks/entree", checkPermission("stocks", "entree"), auditMiddleware("stocks", "CREATE", { entiteType: "stock_entree" }), entreeStock);
router.post("/stocks/sortie", checkPermission("stocks", "sortie"), auditMiddleware("stocks", "CREATE", { entiteType: "stock_sortie" }), sortieStock);
router.get("/stocks/alertes", checkPermission("stocks", "voir_alertes"), getAlertes);
router.get("/stocks/lotissement-stats", checkPermission("stocks", "lire"), getLotissementStats);

export default router;
