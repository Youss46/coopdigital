import { db, distributionsIntrantsTable, remboursementsIntrantsTable, intrantsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Retourne le total des intrants non remboursés (solde dû) pour un membre.
 */
export async function getEncoursMembre(cooperativeId: number, membreId: number): Promise<number> {
  const rows = await db
    .select({
      solde: sql<string>`COALESCE(SUM(montant_membre_fcfa - montant_rembourse_fcfa), 0)`,
    })
    .from(distributionsIntrantsTable)
    .where(
      and(
        eq(distributionsIntrantsTable.membreId, membreId),
        eq(distributionsIntrantsTable.cooperativeId, cooperativeId),
        sql`statut_remboursement != 'rembourse'`,
        sql`montant_membre_fcfa > montant_rembourse_fcfa`
      )
    );

  return Math.round(parseFloat(rows[0]?.solde ?? "0"));
}

/**
 * Enregistre un remboursement automatique par déduction sur livraison.
 * Doit être appelé à l'intérieur d'une transaction.
 */
export async function enregistrerRemboursementParLivraison(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  cooperativeId: number,
  membreId: number,
  montantADeduire: number,
  dateRemboursement: string
): Promise<void> {
  if (montantADeduire <= 0) return;

  const distributions = await tx
    .select()
    .from(distributionsIntrantsTable)
    .where(
      and(
        eq(distributionsIntrantsTable.membreId, membreId),
        eq(distributionsIntrantsTable.cooperativeId, cooperativeId),
        sql`statut_remboursement != 'rembourse'`,
        sql`montant_membre_fcfa > montant_rembourse_fcfa`
      )
    )
    .orderBy(distributionsIntrantsTable.dateDistribution);

  let restant = montantADeduire;

  for (const dist of distributions) {
    if (restant <= 0) break;

    const solde =
      parseFloat(String(dist.montantMembreFcfa)) - parseFloat(String(dist.montantRembourse_fcfa));
    if (solde <= 0) continue;

    const remb = Math.min(solde, restant);
    const nouveauRembourse = parseFloat(String(dist.montantRembourse_fcfa)) + remb;
    const nouveauStatut: "rembourse" | "partiel" | "non_rembourse" =
      nouveauRembourse >= parseFloat(String(dist.montantMembreFcfa)) - 0.01
        ? "rembourse"
        : "partiel";

    await tx
      .update(distributionsIntrantsTable)
      .set({
        montantRembourse_fcfa: String(nouveauRembourse),
        statutRemboursement: nouveauStatut,
      })
      .where(eq(distributionsIntrantsTable.id, dist.id));

    await tx.insert(remboursementsIntrantsTable).values({
      distributionId: dist.id,
      membreId,
      dateRemboursement,
      montantFcfa: String(remb),
      mode: "deduction_livraison",
    });

    restant -= remb;
  }
}
