import { db, chargesDiversesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getTauxPpsi } from "./fiscaliteService.js";

export type CreateChargeInput = {
  dateCharge: string;
  libelle: string;
  description?: string | null;
  montantFcfa: string;
  categorie: string;
  compteDebit: string;
  compteCredit: string;
  modePaiement: string;
  tiers?: string | null;
  referencePiece?: string | null;
};

export async function listChargesDiverses(
  cooperativeId: number,
  filters: { statut?: string; categorie?: string; dateDebut?: string; dateFin?: string; limit?: number; offset?: number } = {},
) {
  const conds = [eq(chargesDiversesTable.cooperativeId, cooperativeId)];
  if (filters.statut)    conds.push(eq(chargesDiversesTable.statut, filters.statut));
  if (filters.categorie) conds.push(eq(chargesDiversesTable.categorie, filters.categorie));
  if (filters.dateDebut) conds.push(gte(chargesDiversesTable.dateCharge, filters.dateDebut));
  if (filters.dateFin)   conds.push(lte(chargesDiversesTable.dateCharge, filters.dateFin));

  const rows = await db
    .select()
    .from(chargesDiversesTable)
    .where(and(...conds))
    .orderBy(desc(chargesDiversesTable.dateCharge))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  return rows;
}

export async function getChargeDiverses(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(chargesDiversesTable)
    .where(and(eq(chargesDiversesTable.id, id), eq(chargesDiversesTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function createChargeDiverses(
  cooperativeId: number,
  createdBy: number,
  data: CreateChargeInput,
) {
  const [row] = await db
    .insert(chargesDiversesTable)
    .values({ cooperativeId, createdBy, ...data })
    .returning();
  return row!;
}

export async function updateChargeDiverses(
  cooperativeId: number,
  id: number,
  data: Partial<CreateChargeInput>,
) {
  const [row] = await db
    .update(chargesDiversesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(chargesDiversesTable.id, id), eq(chargesDiversesTable.cooperativeId, cooperativeId), eq(chargesDiversesTable.statut, "brouillon")))
    .returning();
  return row ?? null;
}

export async function validerChargeDiverses(
  cooperativeId: number,
  id: number,
  approvedBy: number,
) {
  const [charge] = await db.select().from(chargesDiversesTable)
    .where(and(
      eq(chargesDiversesTable.id, id),
      eq(chargesDiversesTable.cooperativeId, cooperativeId),
      eq(chargesDiversesTable.statut, "brouillon"),
    )).limit(1);
  if (!charge) return null;

  const isPpsi = charge.categorie === "ppsi";
  const tauxPpsi = isPpsi ? await getTauxPpsi(cooperativeId) : null;
  const brut = Math.round(parseFloat(charge.montantFcfa));
  const retenue = isPpsi ? Math.min(brut, Math.round(brut * tauxPpsi! / 100)) : 0;
  const [row] = await db
    .update(chargesDiversesTable)
    .set({
      statut: "valide",
      approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
      ...(isPpsi ? {
        ppsiTauxPct: tauxPpsi!.toFixed(2),
        retenuePpsiFcfa: retenue,
        montantNetFcfa: brut - retenue,
      } : {}),
    })
    .where(and(eq(chargesDiversesTable.id, id), eq(chargesDiversesTable.cooperativeId, cooperativeId), eq(chargesDiversesTable.statut, "brouillon")))
    .returning();
  return row ?? null;
}

export async function deleteChargeDiverses(cooperativeId: number, id: number) {
  const [row] = await db
    .delete(chargesDiversesTable)
    .where(and(eq(chargesDiversesTable.id, id), eq(chargesDiversesTable.cooperativeId, cooperativeId), eq(chargesDiversesTable.statut, "brouillon")))
    .returning();
  return row ?? null;
}

export async function getStatsChargesDiverses(
  cooperativeId: number,
  filters: { dateDebut?: string; dateFin?: string } = {},
) {
  const conds = [
    eq(chargesDiversesTable.cooperativeId, cooperativeId),
    eq(chargesDiversesTable.statut, "valide"),
  ];
  if (filters.dateDebut) conds.push(gte(chargesDiversesTable.dateCharge, filters.dateDebut));
  if (filters.dateFin)   conds.push(lte(chargesDiversesTable.dateCharge, filters.dateFin));

  const [totaux] = await db
    .select({
      total_fcfa:   sql<string>`COALESCE(SUM(montant_fcfa), 0)`,
      nb_charges:   sql<string>`COUNT(*)`,
    })
    .from(chargesDiversesTable)
    .where(and(...conds));

  const parCategorie = await db
    .select({
      categorie:  chargesDiversesTable.categorie,
      total:      sql<string>`COALESCE(SUM(montant_fcfa), 0)`,
      nb:         sql<string>`COUNT(*)`,
    })
    .from(chargesDiversesTable)
    .where(and(...conds))
    .groupBy(chargesDiversesTable.categorie)
    .orderBy(desc(sql`SUM(montant_fcfa)`));

  return {
    total_fcfa:    parseFloat(totaux?.total_fcfa ?? "0"),
    nb_charges:    parseInt(totaux?.nb_charges ?? "0"),
    par_categorie: parCategorie.map(r => ({
      categorie: r.categorie,
      total:     parseFloat(r.total),
      nb:        parseInt(r.nb),
    })),
  };
}
