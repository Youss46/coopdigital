import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { sendSmsGroupe, getCommunicationHistorique } from "../controllers/communicationController";
import {
  envoyerMessage,
  getMessagesEnvoyes,
  getMessagesRecus,
  marquerLu,
  getNonLus,
} from "../controllers/messagerieController";

const router: IRouter = Router();

router.use(authMiddleware);

router.post("/communication/messages",          checkPermission("communication", "envoyer_sms"),     envoyerMessage);
router.get("/communication/messages/non-lus",   authMiddleware,                                      getNonLus);
router.get("/communication/messages/envoyes",   checkPermission("communication", "lire_historique"), getMessagesEnvoyes);
router.get("/communication/messages/recus",     authMiddleware,                                      getMessagesRecus);
router.put("/communication/messages/:id/lire",  authMiddleware,                                      marquerLu);

router.post("/communication/sms-groupe",        checkPermission("communication", "envoyer_sms"),     sendSmsGroupe);
router.get("/communication/historique",         checkPermission("communication", "lire_historique"), getCommunicationHistorique);

export default router;
