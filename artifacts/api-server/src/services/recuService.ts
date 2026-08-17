import { db, cooperativesTable } from "@workspace/db";
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
