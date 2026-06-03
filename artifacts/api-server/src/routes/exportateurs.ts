import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listExportateurs,
  createExportateur,
  getExportateurById,
  listVentes,
  createVente,
  encaisserVente,
  getCreances,
} from "../controllers/exportateursController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/exportateurs", listExportateurs);
router.post("/exportateurs", createExportateur);
router.get("/exportateurs/:id", getExportateurById);

router.get("/ventes/creances", getCreances);
router.get("/ventes", listVentes);
router.post("/ventes", createVente);
router.put("/ventes/:id/encaissement", encaisserVente);

export default router;
