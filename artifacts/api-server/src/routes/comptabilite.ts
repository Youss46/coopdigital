import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
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

router.get("/comptabilite/grand-livre", checkPermission("comptabilite", "voir_grand_livre"), getGrandLivre);
router.get("/comptabilite/balance", checkPermission("comptabilite", "voir_balance"), getBalance);
router.get("/comptabilite/journal", checkPermission("comptabilite", "lire"), getJournalComptable);
router.post("/comptabilite/ecriture", checkPermission("comptabilite", "saisir_ecriture_manuelle"), createEcritureManuelle);
router.get("/comptabilite/marge-collecte", checkPermission("comptabilite", "lire"), getMargeCollecte);
router.get("/comptabilite/tresorerie", checkPermission("comptabilite", "lire"), getTresorerie);

export default router;
