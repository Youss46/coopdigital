import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listMembres,
  getMembreById,
  createMembre,
  updateMembre,
  getMembreByQr,
  getMembreHistorique,
} from "../controllers/membresController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/membres", listMembres);
router.post("/membres", createMembre);
router.get("/membres/qr/:token", getMembreByQr);
router.get("/membres/:id/historique", getMembreHistorique);
router.get("/membres/:id", getMembreById);
router.put("/membres/:id", updateMembre);

export default router;
