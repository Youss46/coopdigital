import { Router, type Request, type Response } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  getFaqHandler,
  creerTicketHandler,
  mesTicketsHandler,
  detailTicketHandler,
  ajouterMessageHandler,
  fermerTicketHandler,
} from "../controllers/supportController";
import { generateGuideUtilisateurAsync } from "../services/guideUtilisateurService";

const router = Router();

router.get("/support/faq",                   getFaqHandler);
router.get("/support/tickets",               checkPermission("support", "voir_tickets"), mesTicketsHandler);
router.post("/support/tickets",              checkPermission("support", "creer_ticket"), creerTicketHandler);
router.get("/support/tickets/:id",           checkPermission("support", "voir_tickets"), detailTicketHandler);
router.post("/support/tickets/:id/message",  checkPermission("support", "creer_ticket"), ajouterMessageHandler);
router.put("/support/tickets/:id/fermer",    checkPermission("support", "voir_tickets"), fermerTicketHandler);

router.get("/support/guide", async (_req: Request, res: Response) => {
  try {
    const buffer = await generateGuideUtilisateurAsync();
    const filename = `Guide_CoopDigital_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ erreur: "Erreur lors de la génération du guide PDF" });
  }
});

export default router;
