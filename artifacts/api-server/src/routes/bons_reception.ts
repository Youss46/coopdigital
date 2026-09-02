import { Router } from "express";
import type { Request, Response } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import { db, membresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  creerBonHandler,
  listerBonsHandler,
  detailBonHandler,
  annulerBonHandler,
} from "../controllers/bonReceptionController.js";

const router = Router();

// ─── Liste restreinte des membres délégués de localités (identity only) ────────
// Accessible au magasinier via stocks.lire — utilisée pour pré-remplir le bon
router.get(
  "/pesee/membres-delegues",
  checkPermission("stocks", "lire"),
  async (req: Request, res: Response): Promise<void> => {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    try {
      const membres = await db
        .select({
          id:        membresTable.id,
          nom:       membresTable.nom,
          prenoms:   membresTable.prenoms,
          section:   membresTable.section,
          village:   membresTable.village,
          telephone: membresTable.telephone,
        })
        .from(membresTable)
        .where(
          and(
            eq(membresTable.cooperativeId, cooperativeId),
            eq(membresTable.categorieMembre, "délégué de localités"),
            eq(membresTable.statut, "actif"),
          ),
        )
        .orderBy(membresTable.nom);
      res.json(membres);
    } catch (err) {
      req.log.error({ err }, "listMembresDelegues");
      res.status(500).json({ erreur: "Erreur interne" });
    }
  },
);

// Le Magasinier crée le bon le jour J ; ce droit reste distinct des entrées de stock génériques.
router.post("/pesee/bons-reception",      checkPermission("bons_reception", "creer"), creerBonHandler);
// Liste des bons (magasinier + peseur)
router.get("/pesee/bons-reception",       checkPermission("stocks", "lire"),   listerBonsHandler);
// Détail d'un bon
router.get("/pesee/bons-reception/:id",   checkPermission("stocks", "lire"),   detailBonHandler);
// Annulation
router.delete("/pesee/bons-reception/:id", checkPermission("bons_reception", "annuler"), annulerBonHandler);

export default router;
