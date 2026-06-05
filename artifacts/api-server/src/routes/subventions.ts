import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listerBailleurs, creerBailleur, modifierBailleur, supprimerBailleur,
  listerSubventions, creerSubvention, getSubventionDetail,
  enregistrerTranche, utiliserFonds, getDashboard, genererRapport, soumettreRapport,
} from "../controllers/subventionsController";

const router = Router();

// ── Bailleurs ────────────────────────────────────────────────────────────────
router.get("/bailleurs",     checkPermission("subventions", "voir"),             listerBailleurs);
router.post("/bailleurs",    checkPermission("subventions", "creer_subvention"), creerBailleur);
router.put("/bailleurs/:id", checkPermission("subventions", "creer_subvention"), modifierBailleur);
router.delete("/bailleurs/:id", checkPermission("subventions", "creer_subvention"), supprimerBailleur);

// ── Subventions ───────────────────────────────────────────────────────────────
router.get("/subventions/dashboard",      checkPermission("subventions", "voir"),             getDashboard);
router.get("/subventions",                checkPermission("subventions", "voir"),             listerSubventions);
router.post("/subventions",               checkPermission("subventions", "creer_subvention"), creerSubvention);
router.get("/subventions/:id",            checkPermission("subventions", "voir"),             getSubventionDetail);
router.post("/subventions/:id/tranche",   checkPermission("subventions", "enregistrer_fonds"), enregistrerTranche);
router.put("/subventions/:id/utiliser",   checkPermission("subventions", "utiliser_fonds"),  utiliserFonds);
router.post("/subventions/:id/rapport",   checkPermission("subventions", "generer_rapport"), genererRapport);
router.put("/subventions/:id/rapport/:rapportId/soumettre", checkPermission("subventions", "generer_rapport"), soumettreRapport);

export default router;
