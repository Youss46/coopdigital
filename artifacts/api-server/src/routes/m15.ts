import { Router } from "express";
import { m15AuthMiddleware, requireM15Role } from "../middlewares/m15Auth.js";
import {
  loginM15Handler,
  getDashboardHandler,
  getCooperativesHandler,
  createCooperativeHandler,
  getCooperativeHandler,
  updateCooperativeHandler,
  getPlansHandler,
  genererLicenceHandler,
  activerLicenceHandler,
  renouvelerLicenceHandler,
  toggleRenouvellementAutoHandler,
  suspendreCooperativeHandler,
  reactiverCooperativeHandler,
  supprimerCooperativeHandler,
  getHistoriqueLicenceHandler,
} from "../controllers/m15Controller.js";

const router = Router();

router.post("/m15/auth/login", loginM15Handler);

router.use(m15AuthMiddleware);

router.get("/m15/plans", getPlansHandler);

router.get("/m15/dashboard", getDashboardHandler);

router.get("/m15/cooperatives", getCooperativesHandler);
router.post("/m15/cooperatives", requireM15Role("superadmin", "admin"), createCooperativeHandler);
router.get("/m15/cooperatives/:id", getCooperativeHandler);
router.put("/m15/cooperatives/:id", requireM15Role("superadmin", "admin"), updateCooperativeHandler);

router.post("/m15/licences/generer", requireM15Role("superadmin", "admin"), genererLicenceHandler);
router.post("/m15/licences/activer", requireM15Role("superadmin", "admin"), activerLicenceHandler);
router.put("/m15/licences/:id/renouveler", requireM15Role("superadmin", "admin"), renouvelerLicenceHandler);
router.put("/m15/licences/:id/renouvellement-auto", requireM15Role("superadmin", "admin"), toggleRenouvellementAutoHandler);
router.get("/m15/licences/:id/historique", getHistoriqueLicenceHandler);

router.put("/m15/cooperatives/:id/suspendre", requireM15Role("superadmin", "admin"), suspendreCooperativeHandler);
router.put("/m15/cooperatives/:id/reactiver", requireM15Role("superadmin", "admin"), reactiverCooperativeHandler);
router.delete("/m15/cooperatives/:id", requireM15Role("superadmin"), supprimerCooperativeHandler);

export default router;
