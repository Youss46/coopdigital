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
  getConfigComptable,
  updateConfigComptable,
  listEcrituresEnAttente,
  countEcrituresEnAttente,
  validerEcritureEnAttente,
  rejeterEcritureEnAttente,
  validerToutEcrituresEnAttente,
} from "../controllers/comptabiliteController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/comptabilite/grand-livre", checkPermission("comptabilite", "voir_grand_livre"), getGrandLivre);
router.get("/comptabilite/balance", checkPermission("comptabilite", "voir_balance"), getBalance);
router.get("/comptabilite/journal", checkPermission("comptabilite", "lire"), getJournalComptable);
router.post("/comptabilite/ecriture", checkPermission("comptabilite", "saisir_ecriture_manuelle"), createEcritureManuelle);
router.get("/comptabilite/marge-collecte", checkPermission("comptabilite", "lire"), getMargeCollecte);
router.get("/comptabilite/tresorerie", checkPermission("comptabilite", "lire"), getTresorerie);

// ─── Config comptable ─────────────────────────────────────────────────────────
router.get("/comptabilite/config", checkPermission("comptabilite", "voir_config"), getConfigComptable);
router.put("/comptabilite/config", checkPermission("comptabilite", "modifier_config"), updateConfigComptable);

// ─── Écritures en attente ─────────────────────────────────────────────────────
router.put("/comptabilite/en-attente/valider-tout", checkPermission("comptabilite", "valider_tout"), validerToutEcrituresEnAttente);
router.get("/comptabilite/en-attente/count", checkPermission("comptabilite", "voir_ecritures_attente"), countEcrituresEnAttente);
router.get("/comptabilite/en-attente", checkPermission("comptabilite", "voir_ecritures_attente"), listEcrituresEnAttente);
router.put("/comptabilite/en-attente/:id/valider", checkPermission("comptabilite", "valider_ecriture"), validerEcritureEnAttente);
router.put("/comptabilite/en-attente/:id/rejeter", checkPermission("comptabilite", "rejeter_ecriture"), rejeterEcritureEnAttente);

export default router;
