import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import {
  listMembres,
  getMembreById,
  createMembre,
  updateMembre,
  getMembreByQr,
  getMembreHistorique,
  modifierStatutMembre,
  exportMembresPdf,
} from "../controllers/membresController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/membres/export-pdf", checkPermission("membres", "exporter"), exportMembresPdf);
router.get("/membres", checkPermission("membres", "lire"), listMembres);
router.post("/membres", checkPermission("membres", "creer"), auditMiddleware("membres", "CREATE", { entiteType: "membre" }), createMembre);
router.get("/membres/qr/:token", checkPermission("membres", "lire"), getMembreByQr);
router.get("/membres/:id/historique", checkPermission("membres", "lire"), getMembreHistorique);
router.get("/membres/:id", checkPermission("membres", "lire"), getMembreById);
router.patch("/membres/:id/statut", checkPermission("membres", "modifier"), auditMiddleware("membres", "UPDATE", { entiteIdParam: "id", entiteType: "membre" }), modifierStatutMembre);
router.put("/membres/:id", checkPermission("membres", "modifier"), auditMiddleware("membres", "UPDATE", { entiteIdParam: "id", entiteType: "membre" }), updateMembre);

export default router;
