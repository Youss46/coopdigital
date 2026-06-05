import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listerAGs,
  planifierAG,
  getAgDetail,
  modifierAG,
  ouvrirSeance,
  cloturerSeance,
  envoyerConvocations,
  enregistrerPresence,
  listerPresences,
  enregistrerVote,
  getPvPdf,
} from "../controllers/gouvernanceController";

const router = Router();

router.get(  "/ag",              authMiddleware, checkPermission("gouvernance","voir"),            listerAGs);
router.post( "/ag",              authMiddleware, checkPermission("gouvernance","planifier_ag"),    planifierAG);
router.get(  "/ag/:id",          authMiddleware, checkPermission("gouvernance","voir"),            getAgDetail);
router.put(  "/ag/:id",          authMiddleware, checkPermission("gouvernance","planifier_ag"),    modifierAG);
router.put(  "/ag/:id/ouvrir",   authMiddleware, checkPermission("gouvernance","gerer_seance"),    ouvrirSeance);
router.put(  "/ag/:id/cloturer", authMiddleware, checkPermission("gouvernance","gerer_seance"),    cloturerSeance);
router.post( "/ag/:id/convoquer",authMiddleware, checkPermission("gouvernance","convoquer"),       envoyerConvocations);
router.post( "/ag/:id/presence", authMiddleware, checkPermission("gouvernance","gerer_seance"),    enregistrerPresence);
router.get(  "/ag/:id/presences",authMiddleware, checkPermission("gouvernance","voir"),            listerPresences);
router.post( "/ag/:id/vote",     authMiddleware, checkPermission("gouvernance","enregistrer_vote"),enregistrerVote);
router.get(  "/ag/:id/pv-pdf",   authMiddleware, checkPermission("gouvernance","generer_pv"),      getPvPdf);

export default router;
