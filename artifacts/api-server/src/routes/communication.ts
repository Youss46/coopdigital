import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { sendSmsGroupe, getCommunicationHistorique } from "../controllers/communicationController";

const router: IRouter = Router();

router.use(authMiddleware);

router.post("/communication/sms-groupe", checkPermission("communication", "envoyer_sms"), sendSmsGroupe);
router.get("/communication/historique", checkPermission("communication", "lire_historique"), getCommunicationHistorique);

export default router;
