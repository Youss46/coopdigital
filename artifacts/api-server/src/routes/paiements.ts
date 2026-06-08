import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import { checkPermission } from "../middlewares/permissions";
import { listPaiements, validerPaiement, rejeterPaiement, statsPaiements } from "../controllers/paiementsController";

const router = Router();

router.get("/paiements/stats", authMiddleware, checkPermission("paiements", "lire"), statsPaiements);
router.get("/paiements", authMiddleware, checkPermission("paiements", "lire"), listPaiements);
router.patch("/paiements/:id/valider", authMiddleware, checkPermission("paiements", "valider"), auditMiddleware("paiements", "VALIDATE", { entiteIdParam: "id", entiteType: "paiement" }), validerPaiement);
router.post("/paiements/:id/rejeter", authMiddleware, checkPermission("paiements", "rejeter"), auditMiddleware("paiements", "REJECT", { entiteIdParam: "id", entiteType: "paiement" }), rejeterPaiement);

export default router;
