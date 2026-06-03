import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listLots,
  createLot,
  getLotByQr,
  updateLotStatut,
  getLotTracabilite,
} from "../controllers/lotsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/lots", listLots);
router.post("/lots", createLot);
router.get("/lots/qr/:code", getLotByQr);
router.put("/lots/:id/statut", updateLotStatut);
router.get("/lots/:id/tracabilite", getLotTracabilite);

export default router;
