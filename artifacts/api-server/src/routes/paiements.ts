import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import { listPaiements, validerPaiement } from "../controllers/paiementsController";

const router = Router();

router.get("/paiements", authMiddleware, listPaiements);
router.patch("/paiements/:id/valider", authMiddleware, auditMiddleware("paiements", "VALIDATE", { entiteIdParam: "id", entiteType: "paiement" }), validerPaiement);

export default router;
