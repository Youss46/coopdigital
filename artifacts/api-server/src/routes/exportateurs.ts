import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listExportateurs,
  createExportateur,
  getExportateurById,
  listVentes,
  listStocksReceptionnes,
  createVente,
  encaisserVente,
  getCreances,
  signalerRefus,
} from "../controllers/exportateursController";
import { listLots, previewAutoLot } from "../controllers/lotsController";
import { listEntrepotsHandler } from "../controllers/entrepotDelegueController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/exportateurs", checkPermission("exportateurs", "lire"), listExportateurs);
router.post("/exportateurs", checkPermission("exportateurs", "creer"), createExportateur);
router.get("/exportateurs/:id", checkPermission("exportateurs", "lire"), getExportateurById);

router.get("/ventes/creances", checkPermission("creances", "lire"), getCreances);
router.get("/ventes/lots-disponibles", checkPermission("ventes", "lire"), listLots);
router.post("/ventes/preview-auto", checkPermission("ventes", "creer"), previewAutoLot);
router.get("/ventes/entrepots", checkPermission("ventes", "lire"), listEntrepotsHandler);
router.get("/ventes/stocks-receptionnes", checkPermission("ventes", "lire"), listStocksReceptionnes);
router.get("/ventes", checkPermission("ventes", "lire"), listVentes);
router.post("/ventes", checkPermission("ventes", "creer"), createVente);
router.put("/ventes/:id/encaissement", checkPermission("ventes", "encaisser"), encaisserVente);
router.post("/ventes/:id/refus", checkPermission("refus", "traiter"), signalerRefus);

export default router;
