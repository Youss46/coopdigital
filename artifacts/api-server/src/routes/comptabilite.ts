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
import {
  listPlanComptableHandler,
  createCompteHandler,
  updateCompteHandler,
  deleteCompteHandler,
  listParamsHandler,
  listParamsModuleHandler,
  updateParamsHandler,
  resetModuleHandler,
  searchEcrituresHandler,
  corrigerEcritureHandler,
  getHistoriqueEcritureHandler,
  validerNumeroCompteHandler,
} from "../controllers/planComptableController";

const router: IRouter = Router();

router.use(authMiddleware);

// ─── Grand livre / Balance / Journal ──────────────────────────────────────────
router.get("/comptabilite/grand-livre",   checkPermission("comptabilite", "voir_grand_livre"),        getGrandLivre);
router.get("/comptabilite/balance",       checkPermission("comptabilite", "voir_balance"),            getBalance);
router.get("/comptabilite/journal",       checkPermission("comptabilite", "lire"),                    getJournalComptable);
router.post("/comptabilite/ecriture",     checkPermission("comptabilite", "saisir_ecriture_manuelle"), createEcritureManuelle);
router.get("/comptabilite/marge-collecte",checkPermission("comptabilite", "lire"),                    getMargeCollecte);
router.get("/comptabilite/tresorerie",    checkPermission("comptabilite", "lire"),                    getTresorerie);

// ─── Config comptable ─────────────────────────────────────────────────────────
router.get("/comptabilite/config",  checkPermission("comptabilite", "voir_config"),    getConfigComptable);
router.put("/comptabilite/config",  checkPermission("comptabilite", "modifier_config"), updateConfigComptable);

// ─── Écritures en attente ─────────────────────────────────────────────────────
router.put("/comptabilite/en-attente/valider-tout", checkPermission("comptabilite", "valider_tout"),           validerToutEcrituresEnAttente);
router.get("/comptabilite/en-attente/count",        checkPermission("comptabilite", "voir_ecritures_attente"), countEcrituresEnAttente);
router.get("/comptabilite/en-attente",              checkPermission("comptabilite", "voir_ecritures_attente"), listEcrituresEnAttente);
router.put("/comptabilite/en-attente/:id/valider",  checkPermission("comptabilite", "valider_ecriture"),       validerEcritureEnAttente);
router.put("/comptabilite/en-attente/:id/rejeter",  checkPermission("comptabilite", "rejeter_ecriture"),       rejeterEcritureEnAttente);

// ─── Plan comptable ───────────────────────────────────────────────────────────
router.get("/comptabilite/plan/valider-compte",     checkPermission("comptabilite", "voir_plan"),     validerNumeroCompteHandler);
router.get("/comptabilite/plan",                    checkPermission("comptabilite", "voir_plan"),     listPlanComptableHandler);
router.post("/comptabilite/plan",                   checkPermission("comptabilite", "ajouter_compte"), createCompteHandler);
router.put("/comptabilite/plan/:id",                checkPermission("comptabilite", "modifier_compte"), updateCompteHandler);
router.delete("/comptabilite/plan/:id",             checkPermission("comptabilite", "desactiver_compte"), deleteCompteHandler);

// ─── Paramètres comptes modules ───────────────────────────────────────────────
router.get("/comptabilite/params",                  checkPermission("comptabilite", "voir_params"),   listParamsHandler);
router.get("/comptabilite/params/:module",          checkPermission("comptabilite", "voir_params"),   listParamsModuleHandler);
router.put("/comptabilite/params/:id",              checkPermission("comptabilite", "modifier_params"), updateParamsHandler);
router.post("/comptabilite/params/reset/:module",   checkPermission("comptabilite", "reset_ohada"),   resetModuleHandler);

// ─── Corrections écritures ────────────────────────────────────────────────────
router.get("/comptabilite/ecritures/search",        checkPermission("comptabilite", "lire"),          searchEcrituresHandler);
router.put("/comptabilite/ecritures/:id/corriger",  checkPermission("comptabilite", "corriger"),      corrigerEcritureHandler);
router.get("/comptabilite/ecritures/:id/historique",checkPermission("comptabilite", "voir_historique_corrections"), getHistoriqueEcritureHandler);

export default router;
