import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { licencesTable, plansAbonnementTable } from "@workspace/db";
import { and, eq, desc, or } from "drizzle-orm";
import * as licenceService from "../services/licenceService.js";

const router = Router();

router.post("/saas/activer-licence", authMiddleware, async (req, res) => {
  const { cleLicence } = req.body as { cleLicence?: string };
  const cooperativeId = req.user?.cooperativeId;

  if (!cleLicence || !cooperativeId) {
    res.status(400).json({ erreur: "Clé de licence et coopérative requis" });
    return;
  }

  try {
    const result = await licenceService.activerLicence(cleLicence, cooperativeId);
    res.json({ message: "Licence activée avec succès", ...result });
  } catch (err) {
    req.log.error({ err }, "Erreur activation licence coop");
    res.status(400).json({ erreur: (err as Error).message });
  }
});

router.get("/saas/ma-licence", authMiddleware, async (req, res) => {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative requise" });
    return;
  }

  try {
    const [licence] = await db
      .select({
        id: licencesTable.id,
        cleLicence: licencesTable.cleLicence,
        statut: licencesTable.statut,
        dateActivation: licencesTable.dateActivation,
        dateExpiration: licencesTable.dateExpiration,
        dureeAns: licencesTable.dureeAns,
        renouvellementAuto: licencesTable.renouvellementAuto,
        trialActif: licencesTable.trialActif,
        dateFinTrial: licencesTable.dateFinTrial,
        planNom: plansAbonnementTable.nom,
        nbMembresMax: plansAbonnementTable.nbMembresMax,
        nbUsersMax: plansAbonnementTable.nbUsersMax,
        modulesInclus: plansAbonnementTable.modulesInclus,
        support: plansAbonnementTable.support,
      })
      .from(licencesTable)
      .leftJoin(plansAbonnementTable, eq(licencesTable.planId, plansAbonnementTable.id))
      .where(and(
        eq(licencesTable.cooperativeId, cooperativeId),
        or(
          eq(licencesTable.statut, "active"),
          eq(licencesTable.statut, "trial"),
          eq(licencesTable.statut, "suspendue"),
          eq(licencesTable.statut, "expiree"),
        ),
      ))
      .orderBy(desc(licencesTable.createdAt))
      .limit(1);

    if (!licence) {
      res.status(404).json({ erreur: "Aucune licence trouvée" });
      return;
    }

    const joursRestants = licence.dateExpiration
      ? Math.floor((new Date(licence.dateExpiration).getTime() - Date.now()) / (24 * 3600 * 1000))
      : null;

    const masquee = `M15-****-****-****-${licence.cleLicence.slice(-4)}`;

    res.json({
      ...licence,
      cleLicenceMasquee: masquee,
      joursRestants,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur ma-licence");
    res.status(500).json({ erreur: "Erreur interne" });
  }
});

export default router;
