import { db, cooperativesTable, entrepotsDeleguesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Génère un numéro de réçu séquentiel par coopérative, format REC-YYYY-NNNNN.
 * L'incrément est atomique (UPDATE ... RETURNING) — pas de double attribution.
 * Les gaps sont acceptables (rollback d'une transaction parente, etc.).
 */
export async function genererNumeroRecu(cooperativeId: number): Promise<string> {
  const [updated] = await db
    .update(cooperativesTable)
    .set({ dernierNumeroRecu: sql`dernier_numero_recu + 1` })
    .where(eq(cooperativesTable.id, cooperativeId))
    .returning({ n: cooperativesTable.dernierNumeroRecu });

  const n = updated?.n ?? 1;
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
