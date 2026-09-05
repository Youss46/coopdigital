import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getGrandLivre,
  getBalance,
  getJournalComptable,
  exportJournalCsv,
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
  cloturerExercice,
  apercuCloture,
  getStatutsExercices,
  getGrandLivreTiers,
  getBalanceAuxiliaire,
  listComptesTiers,
  updateComptesTiers,
  exportJournalSageTxt,
  suggestRegularisations,
  listRegularisations,
  createRegularisation,
  deleteRegularisation,
  getApercuAffectationResultat,
  affecterResultat,
  getHistoriqueAffectations,
  apercuRistournes,
  declencherRistournes,
} from "../controllers/comptabiliteController";
import {
  getAnomaliesIA,
  marquerLue,
  marquerToutesLues,
} from "../controllers/anomaliesIAController.js";
import {
  listPlanComptableHandler,
  createCompteHandler,
  updateCompteHandler,
  deleteCompteHandler,
  seedPlanOhadaHandler,
  statusPlanOhadaHandler,
  seedParamsOhadaHandler,
  listParamsHandler,
  listParamsModuleHandler,
  updateParamsHandler,
  resetModuleHandler,
  searchEcrituresHandler,
  corrigerEcritureHandler,
  getHistoriqueEcritureHandler,
  validerNumeroCompteHandler,
} from "../controllers/planComptableController";
import {
  balanceSageUpload,
  previewBalanceSage,
  importBalanceSage,
  listBalanceSageImports,
  getBalanceSageImport,
  prepareBalanceSageReprise,
  validateBalanceSageReprise,
  listBalanceSageRepriseAudit,
  suggestBalanceSageCounterparties,
} from "../controllers/balanceSageController";

const router: IRouter = Router();

router.use(authMiddleware);

// ─── Grand livre / Balance / Journal ──────────────────────────────────────────
router.get("/comptabilite/tiers/:id/grand-livre", authMiddleware, getGrandLivreTiers);
router.get("/comptabilite/grand-livre",   checkPermission("comptabilite", "voir_grand_livre"),        getGrandLivre);
router.get("/comptabilite/balance",           checkPermission("comptabilite", "voir_balance"), getBalance);
router.post("/comptabilite/balances-sage/preview", checkPermission("comptabilite", "importer_balance"), balanceSageUpload.single("fichier"), previewBalanceSage);
router.post("/comptabilite/balances-sage/imports", checkPermission("comptabilite", "importer_balance"), balanceSageUpload.single("fichier"), importBalanceSage);
router.get("/comptabilite/balances-sage/imports", checkPermission("comptabilite", "voir_balance"), listBalanceSageImports);
router.get("/comptabilite/balances-sage/imports/:id", checkPermission("comptabilite", "voir_balance"), getBalanceSageImport);
router.get("/comptabilite/balances-sage/reprises/audit", checkPermission("comptabilite", "voir_balance"), listBalanceSageRepriseAudit);
router.post("/comptabilite/balances-sage/imports/:id/suggestions-contreparties", checkPermission("comptabilite", "importer_balance"), suggestBalanceSageCounterparties);
router.post("/comptabilite/balances-sage/imports/:id/preparer-reprise", checkPermission("comptabilite", "importer_balance"), prepareBalanceSageReprise);
router.post("/comptabilite/balances-sage/imports/:id/valider-reprise", checkPermission("comptabilite", "valider_reprise_balance"), validateBalanceSageReprise);
router.get("/comptabilite/comptes-tiers", checkPermission("comptabilite", "voir_balance"), listComptesTiers);
router.put("/comptabilite/comptes-tiers/:tiersType/:tiersId", checkPermission("comptabilite", "modifier_config"), updateComptesTiers);
router.get("/comptabilite/balance-auxiliaire/export-txt", checkPermission("comptabilite", "voir_balance"), exportJournalSageTxt);
router.get("/comptabilite/balance-auxiliaire", checkPermission("comptabilite", "voir_balance"), getBalanceAuxiliaire);
router.get("/comptabilite/journal",        checkPermission("comptabilite", "lire"), getJournalComptable);
router.get("/comptabilite/journal/export", checkPermission("comptabilite", "lire"), exportJournalCsv);
router.post("/comptabilite/ecriture",     checkPermission("comptabilite", "saisir_ecriture_manuelle"), createEcritureManuelle);
router.get("/comptabilite/marge-collecte",checkPermission("comptabilite", "lire"),                    getMargeCollecte);
router.get("/comptabilite/tresorerie",    checkPermission("comptabilite", "lire"),                    getTresorerie);

// ─── Clôture d'exercice ───────────────────────────────────────────────────────
router.get("/comptabilite/exercices",                  checkPermission("comptabilite", "voir_config"),              getStatutsExercices);
router.get("/comptabilite/cloture/apercu",             checkPermission("comptabilite", "voir_config"),              apercuCloture);
router.post("/comptabilite/cloture",                   checkPermission("comptabilite", "modifier_config"),           cloturerExercice);
router.get("/comptabilite/regularisations",            checkPermission("comptabilite", "voir_config"),              listRegularisations);
router.post("/comptabilite/regularisations/suggestions-claude", checkPermission("comptabilite", "saisir_ecriture_manuelle"), suggestRegularisations);
router.post("/comptabilite/regularisations",           checkPermission("comptabilite", "saisir_ecriture_manuelle"), createRegularisation);
router.delete("/comptabilite/regularisations/:id",     checkPermission("comptabilite", "saisir_ecriture_manuelle"), deleteRegularisation);
router.get("/comptabilite/historique-affectations",    checkPermission("comptabilite", "voir_config"),              getHistoriqueAffectations);
router.get("/comptabilite/ristournes/apercu",          checkPermission("comptabilite", "voir_config"),              apercuRistournes);
router.post("/comptabilite/ristournes/declencher",     checkPermission("comptabilite", "modifier_config"),           declencherRistournes);
router.get("/comptabilite/affectation-resultat",       checkPermission("comptabilite", "voir_config"),              getApercuAffectationResultat);
router.post("/comptabilite/affectation-resultat",      checkPermission("comptabilite", "modifier_config"),           affecterResultat);

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
router.get("/comptabilite/plan/syscohada-status",   checkPermission("comptabilite", "voir_plan"),     statusPlanOhadaHandler);
router.post("/comptabilite/plan/seed-ohada",        checkPermission("comptabilite", "ajouter_compte"), seedPlanOhadaHandler);
router.get("/comptabilite/plan",                    checkPermission("comptabilite", "voir_plan"),     listPlanComptableHandler);
router.post("/comptabilite/plan",                   checkPermission("comptabilite", "ajouter_compte"), createCompteHandler);
router.put("/comptabilite/plan/:id",                checkPermission("comptabilite", "modifier_compte"), updateCompteHandler);
router.delete("/comptabilite/plan/:id",             checkPermission("comptabilite", "desactiver_compte"), deleteCompteHandler);

// ─── Paramètres comptes modules ───────────────────────────────────────────────
router.post("/comptabilite/params/seed-ohada",      checkPermission("comptabilite", "ajouter_compte"), seedParamsOhadaHandler);
router.get("/comptabilite/params",                  checkPermission("comptabilite", "voir_params"),   listParamsHandler);
router.get("/comptabilite/params/:module",          checkPermission("comptabilite", "voir_params"),   listParamsModuleHandler);
router.put("/comptabilite/params/:id",              checkPermission("comptabilite", "modifier_params"), updateParamsHandler);
router.post("/comptabilite/params/reset/:module",   checkPermission("comptabilite", "reset_ohada"),   resetModuleHandler);

// ─── Corrections écritures ────────────────────────────────────────────────────
router.get("/comptabilite/ecritures/search",        checkPermission("comptabilite", "lire"),          searchEcrituresHandler);
router.put("/comptabilite/ecritures/:id/corriger",  checkPermission("comptabilite", "corriger"),      corrigerEcritureHandler);
router.get("/comptabilite/ecritures/:id/historique",checkPermission("comptabilite", "voir_historique_corrections"), getHistoriqueEcritureHandler);

// ─── Veille IA — anomalies comptables ─────────────────────────────────────────
router.get("/comptabilite/anomalies-ia",            checkPermission("comptabilite", "voir_anomalies_ia"), getAnomaliesIA);
router.put("/comptabilite/anomalies-ia/tout-lire",  checkPermission("comptabilite", "voir_anomalies_ia"), marquerToutesLues);
router.put("/comptabilite/anomalies-ia/:id/lire",   checkPermission("comptabilite", "voir_anomalies_ia"), marquerLue);

export default router;
