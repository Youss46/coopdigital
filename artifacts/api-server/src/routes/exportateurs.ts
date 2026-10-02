import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listExportateurs,
  createExportateur,
  getExportateurById,
  listVentes,
  listStocksReceptionnes,
  createVente,
  encaisserVente,
  getCreances,
  signalerRefus,
} from "../controllers/exportateursController";
import { listLots, previewAutoLot } from "../controllers/lotsController";
import { listEntrepotsHandler } from "../controllers/entrepotDelegueController";
import * as avancesExportateursCtrl from "../controllers/avancesExportateursController.js";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/exportateurs", checkPermission("exportateurs", "lire"), listExportateurs);
router.post("/exportateurs", checkPermission("exportateurs", "creer"), createExportateur);
router.get("/exportateurs/:id", checkPermission("exportateurs", "lire"), getExportateurById);

router.get("/ventes/creances", checkPermission("creances", "lire"), getCreances);
router.get("/ventes/lots-disponibles", checkPermission("ventes", "lire"), listLots);
router.post("/ventes/preview-auto", checkPermission("ventes", "creer"), previewAutoLot);
router.get("/ventes/entrepots", checkPermission("ventes", "lire"), listEntrepotsHandler);
router.get("/ventes/stocks-receptionnes", checkPermission("ventes", "lire"), listStocksReceptionnes);
router.get("/ventes", checkPermission("ventes", "lire"), listVentes);
router.post("/ventes", checkPermission("ventes", "creer"), createVente);
router.put("/ventes/:id/encaissement", checkPermission("ventes", "encaisser"), encaisserVente);
router.post("/ventes/:id/refus", checkPermission("refus", "traiter"), signalerRefus);

router.get("/avances-exportateurs", checkPermission("cheques", "lire"), avancesExportateursCtrl.getAvancesExportateurs);
router.post("/avances-exportateurs", checkPermission("cheques", "creer"), avancesExportateursCtrl.postCreerAvanceExportateur);
router.get("/avances-exportateurs/:id", checkPermission("cheques", "lire"), avancesExportateursCtrl.getAvanceExportateur);
router.get("/avances-exportateurs/:id/ventes", checkPermission("cheques", "lire"), avancesExportateursCtrl.getVentesEligiblesAvanceExportateur);
router.post("/avances-exportateurs/:id/imputations", checkPermission("cheques", "encaisser"), avancesExportateursCtrl.postImputerAvanceExportateur);
router.post("/avances-exportateurs/:id/deposer", checkPermission("cheques", "modifier"), avancesExportateursCtrl.postDeposerAvanceExportateur);
router.post("/avances-exportateurs/:id/encaisser", checkPermission("cheques", "encaisser"), avancesExportateursCtrl.postEncaisserAvanceExportateur);
router.post("/avances-exportateurs/:id/rejeter", checkPermission("cheques", "rejeter"), avancesExportateursCtrl.postRejeterAvanceExportateur);
router.post("/avances-exportateurs/:id/annuler", checkPermission("cheques", "annuler"), avancesExportateursCtrl.postAnnulerAvanceExportateur);

export default router;
