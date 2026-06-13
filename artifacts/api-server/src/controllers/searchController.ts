import { type Request, type Response } from "express";
import { db, membresTable, lotsTable, livraisonsTable, avancesTable } from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";

export async function globalSearch(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Non autorisé" });
    return;
  }

  const q = String(req.query["q"] ?? "").trim();
  if (q.length < 2) {
    res.json({ membres: [], lots: [], livraisons: [], avances: [] });
    return;
  }

  const pattern = `%${q}%`;

  const [membres, lots, livraisons, avances] = await Promise.all([
    db
      .select({
        id: membresTable.id,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        telephone: membresTable.telephone,
        village: membresTable.village,
        statut: membresTable.statut,
      })
      .from(membresTable)
      .where(
        and(
          eq(membresTable.cooperativeId, cooperativeId),
          or(
            ilike(membresTable.nom, pattern),
            ilike(membresTable.prenoms, pattern),
            ilike(membresTable.telephone, pattern),
            ilike(membresTable.village, pattern),
          ),
        ),
      )
      .orderBy(desc(membresTable.createdAt))
      .limit(5),

    db
      .select({
        id: lotsTable.id,
        qrCodeLot: lotsTable.qrCodeLot,
        statut: lotsTable.statut,
        poidsTotalKg: lotsTable.poidsTotalKg,
        dateCreation: lotsTable.dateCreation,
      })
      .from(lotsTable)
      .where(
        and(
          eq(lotsTable.cooperativeId, cooperativeId),
          sql`${lotsTable.qrCodeLot}::text ilike ${pattern}`,
        ),
      )
      .limit(5),

    db
      .select({
        id: livraisonsTable.id,
        poidsKg: livraisonsTable.poidsKg,
        dateLivraison: livraisonsTable.dateLivraison,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(livraisonsTable)
      .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .where(
        and(
          eq(membresTable.cooperativeId, cooperativeId),
          or(
            ilike(membresTable.nom, pattern),
            ilike(membresTable.prenoms, pattern),
            ilike(membresTable.telephone, pattern),
            ilike(membresTable.village, pattern),
          ),
        ),
      )
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(5),

    db
      .select({
        id: avancesTable.id,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        montantRembourseFcfa: avancesTable.montantRembourse_fcfa,
        statut: avancesTable.statut,
        dateOctroi: avancesTable.dateOctroi,
        motif: avancesTable.motif,
        membreId: membresTable.id,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        membreTelephone: membresTable.telephone,
      })
      .from(avancesTable)
      .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(
        and(
          eq(membresTable.cooperativeId, cooperativeId),
          or(
            ilike(membresTable.nom, pattern),
            ilike(membresTable.prenoms, pattern),
            ilike(membresTable.telephone, pattern),
            ilike(membresTable.village, pattern),
          ),
        ),
      )
      .orderBy(desc(avancesTable.dateOctroi))
      .limit(5),
  ]);

  res.json({ membres, lots, livraisons, avances });
}
