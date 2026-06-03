import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { sendSmsGroupe, getCommunicationHistorique } from "../controllers/communicationController";

const router: IRouter = Router();

router.use(authMiddleware);

router.post("/communication/sms-groupe", sendSmsGroupe);
router.get("/communication/historique", getCommunicationHistorique);

export default router;
