import { db, entrepotsDeleguesTable, sequencesPeseeTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Réserve atomiquement le prochain rang de pesée pour une coopérative et une
 * année civile. Les gaps sont acceptables si la création parente est annulée.
 */
export async function reserverNumeroPesee(cooperativeId: number): Promise<{ numero: number; annee: number }> {
  const annee = new Date().getFullYear();
  const [row] = await db
    .insert(sequencesPeseeTable)
    .values({ cooperativeId, annee, compteur: 1 })
    .onConflictDoUpdate({
      target: [sequencesPeseeTable.cooperativeId, sequencesPeseeTable.annee],
      set: { compteur: sql`${sequencesPeseeTable.compteur} + 1` },
    })
    .returning({ numero: sequencesPeseeTable.compteur });

  const numero = row?.numero;
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error("Impossible de générer un numéro de pesée");
  }
  return { numero, annee };
}

/**
 * Génère un numéro de reçu séquentiel global, format REC-YYYY-NNNNN.
 *
 * `paiements.numero_recu` possède une contrainte UNIQUE globale, alors que les
 * coopératives sont des tenants distincts. Un compteur par coopérative pouvait
 * donc générer le même numéro dans deux coopératives. La séquence PostgreSQL
 * garantit une attribution atomique et sans collision entre tous les tenants.
 *
 * Les gaps sont acceptables (rollback d'une transaction parente, etc.).
 */
export async function genererNumeroRecu(_cooperativeId: number): Promise<string> {
  const result = await db.execute<{ n: string | number }>(
    sql`SELECT nextval('numero_recu_global_seq') AS n`,
  );
  const n = Number(result.rows[0]?.n);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("Impossible de générer un numéro de reçu");
  }
  const year = new Date().getFullYear();
  return `REC-${year}-${String(n).padStart(5, "0")}`;
}

/**
 * Génère un numéro de livraison séquentiel propre à un entrepôt délégué.
 * Format : LIV-D{entrepotId zero-padded 2}-{NNNN}
 * Ex : LIV-D01-0001, LIV-D02-0003
 * L'incrément est atomique (UPDATE … RETURNING) — pas de double attribution.
 */
export async function genererNumeroLivraison(entrepotDelegueId: number): Promise<string> {
  const [updated] = await db
    .update(entrepotsDeleguesTable)
    .set({ dernierNumeroLivraison: sql`dernier_numero_livraison + 1` })
    .where(eq(entrepotsDeleguesTable.id, entrepotDelegueId))
    .returning({ id: entrepotsDeleguesTable.id, n: entrepotsDeleguesTable.dernierNumeroLivraison });

  const n = updated?.n ?? 1;
  const code = String(updated?.id ?? entrepotDelegueId).padStart(2, "0");
  return `LIV-D${code}-${String(n).padStart(4, "0")}`;
}
