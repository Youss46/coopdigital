import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import { listLivraisons, createLivraison, getLivraisonsNonLotees } from "../controllers/livraisonsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/livraisons/non-lotees", checkPermission("livraisons", "lire"), getLivraisonsNonLotees);
router.get("/livraisons", checkPermission("livraisons", "lire"), listLivraisons);
router.post("/livraisons", checkPermission("livraisons", "creer"), auditMiddleware("livraisons", "CREATE", { entiteType: "livraison" }), createLivraison);

export default router;
