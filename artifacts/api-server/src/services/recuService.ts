import { db, entrepotsDeleguesTable, sequencesPeseeTable, sequencesRecusTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Réserve atomiquement le prochain rang de pesée pour une coopérative et une
 * année civile. Les gaps sont acceptables si la création parente est annulée.
 */
export async function reserverNumeroPesee(
  cooperativeId: number,
  dateReference: string | Date | number = new Date(),
): Promise<{ numero: number; annee: number }> {
  const annee = typeof dateReference === "number"
    ? dateReference
    : Number(String(dateReference instanceof Date ? dateReference.toISOString() : dateReference).slice(0, 4));
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2200) {
    throw new Error("Année invalide pour la génération du numéro de pesée");
  }
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

export function formatNumeroPesee(
  numeroPesee: number | null | undefined,
  annee: number | null | undefined,
): string | null {
  if (numeroPesee == null || annee == null) return null;
  return `PES-S-${annee}-${String(numeroPesee).padStart(5, "0")}`;
}

/**
 * Génère un numéro de reçu séquentiel par coopérative et année civile,
 * format REC-YYYY-NNNNN.
 *
 * Les gaps sont acceptables (rollback d'une transaction parente, etc.).
 */
export async function genererNumeroRecu(cooperativeId: number): Promise<string> {
  if (!Number.isInteger(cooperativeId) || cooperativeId < 1) {
    throw new Error("Coopérative invalide pour la génération du numéro de reçu");
  }
  const annee = new Date().getFullYear();
  const [row] = await db
    .insert(sequencesRecusTable)
    .values({ cooperativeId, annee, compteur: 1 })
    .onConflictDoUpdate({
      target: [sequencesRecusTable.cooperativeId, sequencesRecusTable.annee],
      set: { compteur: sql`${sequencesRecusTable.compteur} + 1` },
    })
    .returning({ numero: sequencesRecusTable.compteur });
  const n = row?.numero;
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("Impossible de générer un numéro de reçu");
  }
  return `REC-${annee}-${String(n).padStart(5, "0")}`;
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
