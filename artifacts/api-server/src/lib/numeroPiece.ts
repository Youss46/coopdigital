import { db } from "@workspace/db";
import { ecrituresComptablesTable, sequencesPiecesTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

const SOURCE_PREFIXES: Record<string, string> = {
  livraison:         "LIV",
  paiement:          "PAI",
  avance:            "AVC",
  encaissement:      "ENC",
  vente:             "VTE",
  salaire:           "SAL",
  stock:             "STK",
  don:               "DON",
  intrant:           "INT",
  prime_paiement:    "PRM",
  commission_delegue:"COM",
  manuel:            "MAN",
};

/**
 * Incrémente atomiquement le compteur par (cooperativeId, exercice) et retourne
 * le numéro séquentiel alloué à cette écriture.
 * L'upsert PostgreSQL garantit l'atomicité sans transaction externe.
 */
async function nextNumero(cooperativeId: number, exercice: number): Promise<number> {
  const [row] = await db
    .insert(sequencesPiecesTable)
    .values({ cooperativeId, exercice, compteur: 1 })
    .onConflictDoUpdate({
      target: [sequencesPiecesTable.cooperativeId, sequencesPiecesTable.exercice],
      set: { compteur: sql`${sequencesPiecesTable.compteur} + 1` },
    })
    .returning({ compteur: sequencesPiecesTable.compteur });
  return row.compteur;
}

export function buildNumeroPiece(source: string, exercice: number, seq: number): string {
  const prefix = SOURCE_PREFIXES[source] ?? "EC";
  return `${prefix}-${exercice}-${String(seq).padStart(6, "0")}`;
}

/**
 * Génère et affecte un numéro de pièce séquentiel par coopérative + exercice.
 * Retourne le numéro attribué pour que l'appelant puisse l'inclure dans sa réponse HTTP.
 */
export async function assignerNumeroPiece(
  id: number,
  source: string,
  exercice: number,
  cooperativeId?: number,
): Promise<string> {
  let coopId = cooperativeId;

  if (!coopId) {
    // Fallback : on lit la cooperative_id directement depuis l'écriture
    const row = await db.query.ecrituresComptablesTable.findFirst({
      columns: { cooperativeId: true },
      where: eq(ecrituresComptablesTable.id, id),
    });
    coopId = row?.cooperativeId;
    if (!coopId) return "";
  }

  const seq = await nextNumero(coopId, exercice);
  const numeroPiece = buildNumeroPiece(source, exercice, seq);

  await db
    .update(ecrituresComptablesTable)
    .set({ numeroPiece })
    .where(eq(ecrituresComptablesTable.id, id));

  return numeroPiece;
}

export async function assignerNumerosPieces(
  rows: Array<{ id: number; source: string; exercice: number; cooperativeId?: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  // Séquentiel intentionnel : les appels parallèles sur le même (coop, exercice)
  // fonctionnent grâce à l'upsert atomique, mais l'ordre des numéros attribués
  // serait non-déterministe. On les traite en série pour avoir une numérotation
  // cohérente avec l'ordre du tableau.
  for (const r of rows) {
    await assignerNumeroPiece(r.id, r.source, r.exercice, r.cooperativeId);
  }
}
