import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getGrandLivre,
  getBalance,
  getJournalComptable,
  createEcritureManuelle,
  getMargeCollecte,
  getTresorerie,
} from "../controllers/comptabiliteController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/comptabilite/grand-livre", getGrandLivre);
router.get("/comptabilite/balance", getBalance);
router.get("/comptabilite/journal", getJournalComptable);
router.post("/comptabilite/ecriture", createEcritureManuelle);
router.get("/comptabilite/marge-collecte", getMargeCollecte);
router.get("/comptabilite/tresorerie", getTresorerie);

export default router;
