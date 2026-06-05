import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  creerOuGetBudget,
  getBudgetCampagne,
  modifierLigne,
  validerBudget,
  getAlertes,
  getRapport,
  saisirHypotheses,
  triggerSync,
} from "../controllers/budgetController";

const router = Router();

// Créer ou récupérer le budget d'une campagne
router.post("/budget/campagne/:id",        checkPermission("budget", "creer"),    creerOuGetBudget);
// Budget complet (lignes + hypothèses + totaux)
router.get("/budget/campagne/:id",         checkPermission("budget", "voir"),     getBudgetCampagne);
// Modifier une ligne prévisionnelle
router.put("/budget/:id/ligne",            checkPermission("budget", "modifier"), modifierLigne);
// Valider le budget
router.put("/budget/:id/valider",          checkPermission("budget", "valider"),  validerBudget);
// Lignes en dépassement
router.get("/budget/:id/alertes",          checkPermission("budget", "voir"),     getAlertes);
// Rapport budget vs réalisé
router.get("/budget/:id/rapport",          checkPermission("budget", "voir"),     getRapport);
// Saisir les hypothèses
router.post("/budget/:id/hypotheses",      checkPermission("budget", "modifier"), saisirHypotheses);
// Sync manuel du réalisé
router.post("/budget/:id/sync",            checkPermission("budget", "modifier"), triggerSync);

export default router;
