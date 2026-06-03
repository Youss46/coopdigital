import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { listLivraisons, createLivraison, getLivraisonsNonLotees } from "../controllers/livraisonsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/livraisons/non-lotees", getLivraisonsNonLotees);
router.get("/livraisons", listLivraisons);
router.post("/livraisons", createLivraison);

export default router;
