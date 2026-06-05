import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getJournal,
  getEntiteHistorique,
  getUserActions,
  getSessions,
  getStats,
  exportPdf,
  getModifications,
} from "../controllers/auditController";

const router = Router();

router.get("/audit/journal",                             authMiddleware, checkPermission("audit", "voir_journal"),            getJournal);
router.get("/audit/entite/:type/:id",                    authMiddleware, checkPermission("audit", "voir_historique_entite"),  getEntiteHistorique);
router.get("/audit/user/:id",                            authMiddleware, checkPermission("audit", "voir_journal"),            getUserActions);
router.get("/audit/sessions",                            authMiddleware, checkPermission("audit", "voir_journal"),            getSessions);
router.get("/audit/stats",                               authMiddleware, checkPermission("audit", "voir_stats"),              getStats);
router.get("/audit/export-pdf",                          authMiddleware, checkPermission("audit", "exporter"),                exportPdf);
router.get("/audit/modifications/:entite_type/:entite_id", authMiddleware, checkPermission("audit", "voir_historique_entite"), getModifications);

export default router;
