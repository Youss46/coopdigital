import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listLots,
  createLot,
  previewAutoLot,
  getLotByQr,
  updateLotStatut,
  getLotTracabilite,
  fusionnerLots,
  getLotEudrPdf,
} from "../controllers/lotsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.post("/lots/fusionner", checkPermission("tracabilite", "modifier_lot"), fusionnerLots);
router.post("/lots/preview-auto", checkPermission("tracabilite", "creer_lot"), previewAutoLot);
router.get("/lots", checkPermission("tracabilite", "lire"), listLots);
router.post("/lots", checkPermission("tracabilite", "creer_lot"), createLot);
router.get("/lots/qr/:code", checkPermission("tracabilite", "scanner_qr"), getLotByQr);
router.put("/lots/:id/statut", checkPermission("tracabilite", "modifier_lot"), updateLotStatut);
router.get("/lots/:id/tracabilite", checkPermission("tracabilite", "lire"), getLotTracabilite);
router.get("/lots/:id/eudr/pdf", checkPermission("tracabilite", "lire"), getLotEudrPdf);

export default router;
