import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listLots,
  createLot,
  getLotByQr,
  updateLotStatut,
  getLotTracabilite,
  fusionnerLots,
  expedierLot,
} from "../controllers/lotsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.post("/lots/fusionner", checkPermission("tracabilite", "modifier_lot"), fusionnerLots);
router.get("/lots", checkPermission("tracabilite", "lire"), listLots);
router.post("/lots", checkPermission("tracabilite", "creer_lot"), createLot);
router.get("/lots/qr/:code", checkPermission("tracabilite", "scanner_qr"), getLotByQr);
router.put("/lots/:id/expedier", checkPermission("tracabilite", "modifier_lot"), expedierLot);
router.put("/lots/:id/statut", checkPermission("tracabilite", "modifier_lot"), updateLotStatut);
router.get("/lots/:id/tracabilite", checkPermission("tracabilite", "lire"), getLotTracabilite);

export default router;
