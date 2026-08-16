import { Router } from "express";
import { terrainAuthMiddleware, delegueOnly, peseurOrDelegueOnly } from "../middlewares/terrainAuth.js";
import { authMiddleware } from "../middlewares/auth.js";
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

router.get("/entrepots/stats",               authMiddleware, getStatsHandler);
router.get("/entrepots/delegues-liste",      authMiddleware, listDeleguesEntrepotsHandler);
router.get("/entrepots",                     authMiddleware, listEntrepotsHandler);
router.post("/entrepots",                    authMiddleware, creerEntrepotHandler);
router.put("/entrepots/:id",                 authMiddleware, modifierEntrepotHandler);
router.get("/entrepots/:id/mouvements",      authMiddleware, getMouvementsEntrepotHandler);
router.post("/entrepots/:id/ajustement",     authMiddleware, ajusterStockHandler);
router.post("/entrepots/:id/transfert",      authMiddleware, creerTransfertAdminHandler);

router.get("/transferts",                                authMiddleware, listTransfertsHandler);
router.get("/transferts/:id/pdf",                        authMiddleware, getRapportTransfertPdfHandler);
router.put("/transferts/:id/arrivee-physique",           authMiddleware, signalerArriveePhysiqueHandler);
router.put("/transferts/:id/arrivee",                    authMiddleware, confirmerArriveeHandler);
router.put("/transferts/:id/litige",                     authMiddleware, signalerLitigeHandler);

export default router;
