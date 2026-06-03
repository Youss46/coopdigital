import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listEmployes,
  getEmployeById,
  createEmploye,
  updateEmploye,
  desactiverEmploye,
  listFichesPaie,
  getFichePaieById,
  createFichePaie,
  validerFichePaie,
  payerFichePaie,
  deleteFichePaie,
  getRecapSalaires,
} from "../controllers/salairesController";

const router: IRouter = Router();

router.use(authMiddleware);

// ─── Employés ────────────────────────────────────────────────────────────────
router.get("/salaires/employes", checkPermission("salaires", "lire"), listEmployes);
router.post("/salaires/employes", checkPermission("salaires", "creer_employe"), createEmploye);
router.get("/salaires/employes/:id", checkPermission("salaires", "lire"), getEmployeById);
router.put("/salaires/employes/:id", checkPermission("salaires", "modifier_employe"), updateEmploye);
router.delete("/salaires/employes/:id", checkPermission("salaires", "modifier_employe"), desactiverEmploye);

// ─── Fiches de paie ──────────────────────────────────────────────────────────
router.get("/salaires/fiches", checkPermission("salaires", "lire"), listFichesPaie);
router.post("/salaires/fiches", checkPermission("salaires", "creer_fiche"), createFichePaie);
router.get("/salaires/recap", checkPermission("salaires", "lire"), getRecapSalaires);
router.get("/salaires/fiches/:id", checkPermission("salaires", "lire"), getFichePaieById);
router.put("/salaires/fiches/:id/valider", checkPermission("salaires", "valider_fiche"), validerFichePaie);
router.put("/salaires/fiches/:id/payer", checkPermission("salaires", "marquer_paye"), payerFichePaie);
router.delete("/salaires/fiches/:id", checkPermission("salaires", "supprimer_fiche"), deleteFichePaie);

export default router;
