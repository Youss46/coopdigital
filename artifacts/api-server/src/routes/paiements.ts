import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { listPaiements, validerPaiement } from "../controllers/paiementsController";

const router = Router();

router.get("/paiements", authMiddleware, listPaiements);
router.patch("/paiements/:id/valider", authMiddleware, validerPaiement);

export default router;
