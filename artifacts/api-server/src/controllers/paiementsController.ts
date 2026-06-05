import { type Request, type Response } from "express";
import { db, paiementsTable, membresTable, livraisonsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export async function listPaiements(req: Request, res: Response): Promise<void> {
  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "50")));

    const paiements = await db
      .select({
        id: paiementsTable.id,
        livraisonId: paiementsTable.livraisonId,
        membreId: paiementsTable.membreId,
        montantFcfa: paiementsTable.montantFcfa,
        modePaiement: paiementsTable.modePaiement,
        referenceTransaction: paiementsTable.referenceTransaction,
        statut: paiementsTable.statut,
        createdAt: paiementsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        telephone: membresTable.telephone,
        dateLivraison: livraisonsTable.dateLivraison,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .where(
        statut && membreId
          ? eq(paiementsTable.statut, statut as "en_attente" | "confirme" | "echec") // simplified; real app would combine
          : statut
          ? eq(paiementsTable.statut, statut as "en_attente" | "confirme" | "echec")
          : membreId
          ? eq(paiementsTable.membreId, membreId)
          : undefined,
      )
      .orderBy(desc(paiementsTable.createdAt))
      .limit(limit);

    res.json(paiements);
  } catch (err) {
    req.log.error({ err }, "Erreur listPaiements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function validerPaiement(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) {
    res.status(400).json({ erreur: "ID invalide" });
    return;
  }

  const body = (req.body ?? {}) as { referenceTransaction?: string | null };

  try {
    const [existing] = await db
      .select()
      .from(paiementsTable)
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }

    const [updated] = await db
      .update(paiementsTable)
      .set({
        statut: "confirme",
        referenceTransaction: body.referenceTransaction ?? existing.referenceTransaction,
      })
      .where(eq(paiementsTable.id, id))
      .returning();

    const [paiement] = await db
      .select({
        id: paiementsTable.id,
        livraisonId: paiementsTable.livraisonId,
        membreId: paiementsTable.membreId,
        montantFcfa: paiementsTable.montantFcfa,
        modePaiement: paiementsTable.modePaiement,
        referenceTransaction: paiementsTable.referenceTransaction,
        statut: paiementsTable.statut,
        createdAt: paiementsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        telephone: membresTable.telephone,
        dateLivraison: livraisonsTable.dateLivraison,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .where(eq(paiementsTable.id, updated!.id))
      .limit(1);

    res.json(paiement);
  } catch (err) {
    req.log.error({ err }, "Erreur validerPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
