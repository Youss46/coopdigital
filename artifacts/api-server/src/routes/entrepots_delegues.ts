import { Router } from "express";
import { terrainAuthMiddleware, delegueOnly, peseurOrDelegueOnly } from "../middlewares/terrainAuth.js";
import { authMiddleware } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permissions.js";
import {
  getMonEntrepotHandler,
  getMesMouvementsHandler,
  getMesTransfertsHandler,
  creerTransfertHandler,
  confirmerDepartHandler,
  getStatsHandler,
  listEntrepotsHandler,
  creerEntrepotHandler,
  modifierEntrepotHandler,
  getMouvementsEntrepotHandler,
  ajusterStockHandler,
  listTransfertsHandler,
  confirmerArriveeHandler,
  signalerLitigeHandler,
  listDeleguesEntrepotsHandler,
  creerTransfertAdminHandler,
  getRapportTransfertPdfHandler,
  signalerArriveePhysiqueHandler,
  listTransfertsEnAttentePeseeHandler,
} from "../controllers/entrepotDelegueController.js";

const router = Router();

// ─── Routes terrain (JWT délégué) ─────────────────────────────────────────────
// IMPORTANT : enregistrées AVANT le authMiddleware global dans index.ts

router.get("/terrain/entrepot",              terrainAuthMiddleware, delegueOnly, getMonEntrepotHandler);
router.get("/terrain/entrepot/mouvements",   terrainAuthMiddleware, delegueOnly, getMesMouvementsHandler);
router.get("/terrain/entrepot/transferts",   terrainAuthMiddleware, delegueOnly, getMesTransfertsHandler);
router.post("/terrain/entrepot/transferts",  terrainAuthMiddleware, delegueOnly, creerTransfertHandler);
router.put("/terrain/entrepot/transferts/:id/depart",           terrainAuthMiddleware, delegueOnly,            confirmerDepartHandler);
// Signaler arrivée physique — peseur central OU délégué OU admin (flex)
router.put("/terrain/entrepot/transferts/:id/arrivee-physique", terrainAuthMiddleware, peseurOrDelegueOnly,     signalerArriveePhysiqueHandler);
// Liste des transferts en attente de pesée — peseur central uniquement
router.get("/terrain/transferts/en_attente_pesee",              terrainAuthMiddleware, peseurOrDelegueOnly,     listTransfertsEnAttentePeseeHandler);

// ─── Routes admin (JWT coopérative) ───────────────────────────────────────────
// Ont leur propre authMiddleware (routeur enregistré avant le guard global)
// et leur propre RBAC : le garde global de routes n'est pas encore exécuté.
const adminReadMiddleware = [authMiddleware, checkPermission("entrepots_delegues", "lire")];
const adminManageMiddleware = [authMiddleware, checkPermission("entrepots_delegues", "gerer")];
router.use(["/entrepots", "/transferts"], ...adminReadMiddleware);

router.get("/entrepots/stats",               ...adminReadMiddleware, getStatsHandler);
router.get("/entrepots/delegues-liste",      ...adminReadMiddleware, listDeleguesEntrepotsHandler);
router.get("/entrepots",                     ...adminReadMiddleware, listEntrepotsHandler);
router.post("/entrepots",                    ...adminManageMiddleware, creerEntrepotHandler);
router.put("/entrepots/:id",                 ...adminManageMiddleware, modifierEntrepotHandler);
router.get("/entrepots/:id/mouvements",      ...adminReadMiddleware, getMouvementsEntrepotHandler);
router.post("/entrepots/:id/ajustement",     ...adminManageMiddleware, ajusterStockHandler);
router.post("/entrepots/:id/transfert",      ...adminManageMiddleware, creerTransfertAdminHandler);

router.get("/transferts",                                ...adminReadMiddleware, listTransfertsHandler);
router.get("/transferts/:id/pdf",                        ...adminReadMiddleware, getRapportTransfertPdfHandler);
router.put("/transferts/:id/arrivee-physique",           ...adminManageMiddleware, signalerArriveePhysiqueHandler);
router.put("/transferts/:id/arrivee",                    ...adminManageMiddleware, confirmerArriveeHandler);
router.put("/transferts/:id/litige",                     ...adminManageMiddleware, signalerLitigeHandler);

export default router;
