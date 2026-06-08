import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listExportateurs,
  createExportateur,
  getExportateurById,
  listVentes,
  createVente,
  encaisserVente,
  getCreances,
  signalerRefus,
} from "../controllers/exportateursController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/exportateurs", checkPermission("exportateurs", "lire"), listExportateurs);
router.post("/exportateurs", checkPermission("exportateurs", "creer"), createExportateur);
router.get("/exportateurs/:id", checkPermission("exportateurs", "lire"), getExportateurById);

router.get("/ventes/creances", checkPermission("creances", "lire"), getCreances);
router.get("/ventes", checkPermission("exportateurs", "lire"), listVentes);
router.post("/ventes", checkPermission("exportateurs", "creer"), createVente);
router.put("/ventes/:id/encaissement", checkPermission("creances", "enregistrer_encaissement"), encaisserVente);
router.post("/ventes/:id/refus", checkPermission("refus", "traiter"), signalerRefus);

export default router;
