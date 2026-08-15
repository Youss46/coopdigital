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
  updateEntrepot,
  deleteEntrepot,
  getLotissementStats,
} from "../controllers/stocksController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/stocks/entrepots", checkPermission("stocks", "lire"), getEntrepots);
router.post("/stocks/entrepots", checkPermission("stocks", "entree"), auditMiddleware("stocks", "CREATE", { entiteType: "entrepot" }), createEntrepot);
router.put("/stocks/entrepots/:id", checkPermission("stocks", "entree"), auditMiddleware("stocks", "UPDATE", { entiteIdParam: "id", entiteType: "entrepot" }), updateEntrepot);
router.delete("/stocks/entrepots/:id", checkPermission("stocks", "entree"), auditMiddleware("stocks", "DELETE", { entiteIdParam: "id", entiteType: "entrepot" }), deleteEntrepot);
router.get("/stocks/mouvements", checkPermission("stocks", "lire"), getMouvements);
router.post("/stocks/entree", checkPermission("stocks", "entree"), auditMiddleware("stocks", "CREATE", { entiteType: "stock_entree" }), entreeStock);
router.post("/stocks/sortie", checkPermission("stocks", "sortie"), auditMiddleware("stocks", "CREATE", { entiteType: "stock_sortie" }), sortieStock);
router.get("/stocks/alertes", checkPermission("stocks", "voir_alertes"), getAlertes);
router.get("/stocks/lotissement-stats", checkPermission("stocks", "lire"), getLotissementStats);

export default router;
