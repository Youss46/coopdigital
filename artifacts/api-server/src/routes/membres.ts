import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
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

router.get("/membres", checkPermission("membres", "lire"), listMembres);
router.post("/membres", checkPermission("membres", "creer"), createMembre);
router.get("/membres/qr/:token", checkPermission("membres", "lire"), getMembreByQr);
router.get("/membres/:id/historique", checkPermission("membres", "lire"), getMembreHistorique);
router.get("/membres/:id", checkPermission("membres", "lire"), getMembreById);
router.put("/membres/:id", checkPermission("membres", "modifier"), updateMembre);

export default router;
