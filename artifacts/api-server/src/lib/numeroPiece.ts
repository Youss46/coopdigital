import { db } from "@workspace/db";
import { ecrituresComptablesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const SOURCE_PREFIXES: Record<string, string> = {
  livraison:    "LIV",
  paiement:     "PAI",
  avance:       "AVC",
  encaissement: "ENC",
  vente:        "VTE",
  salaire:      "SAL",
  stock:        "STK",
  manuel:       "MAN",
};

export function buildNumeroPiece(source: string, exercice: number, id: number): string {
  const prefix = SOURCE_PREFIXES[source] ?? "EC";
  return `${prefix}-${exercice}-${String(id).padStart(5, "0")}`;
}

export async function assignerNumeroPiece(
  id: number,
  source: string,
  exercice: number,
): Promise<void> {
  await db
    .update(ecrituresComptablesTable)
    .set({ numeroPiece: buildNumeroPiece(source, exercice, id) })
    .where(eq(ecrituresComptablesTable.id, id));
}

export async function assignerNumerosPieces(
  rows: Array<{ id: number; source: string; exercice: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  await Promise.all(
    rows.map((r) => assignerNumeroPiece(r.id, r.source, r.exercice)),
  );
}
