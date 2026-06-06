import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getFaqHandler,
  creerTicketHandler,
  mesTicketsHandler,
  detailTicketHandler,
  ajouterMessageHandler,
  fermerTicketHandler,
} from "../controllers/supportController";

const router = Router();

router.get("/support/faq",                   getFaqHandler);
router.get("/support/tickets",               checkPermission("support", "voir_tickets"), mesTicketsHandler);
router.post("/support/tickets",              checkPermission("support", "creer_ticket"), creerTicketHandler);
router.get("/support/tickets/:id",           checkPermission("support", "voir_tickets"), detailTicketHandler);
router.post("/support/tickets/:id/message",  checkPermission("support", "creer_ticket"), ajouterMessageHandler);
router.put("/support/tickets/:id/fermer",    checkPermission("support", "voir_tickets"), fermerTicketHandler);

export default router;
