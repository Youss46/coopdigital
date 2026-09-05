import {
  db,
  chargesDiversesTable,
  caissesTable,
  sessionsCaisseTable,
  mouvementsCaisseTable,
  comptesBancairesTable,
  mouvementsBanqueTable,
  comptesMobilesMarchandsTable,
  mouvementsMobileMarchandTable,
} from "@workspace/db";
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
  compteTresorerieId?: number | null;
  compteTresorerieType?: "caisse" | "banque" | "mobile_marchand" | null;
};

export type ReglementPpsi = {
  brut: number;
  retenue: number;
  net: number;
};

/**
 * Calcule le règlement PPSI à partir du brut et du taux configuré.
 * Les bornes sont appliquées ici plutôt que seulement à la configuration :
 * des données historiques incohérentes ne doivent jamais générer un paiement
 * supérieur à la dette constatée.
 */
export function calculerReglementPpsi(brutInput: number, tauxInput: number): ReglementPpsi {
  const brut = Number.isFinite(brutInput) ? Math.max(0, Math.round(brutInput)) : 0;
  const taux = Number.isFinite(tauxInput) ? Math.min(100, Math.max(0, tauxInput)) : 0;
  const retenue = Math.min(brut, Math.max(0, Math.round(brut * taux / 100)));
  return { brut, retenue, net: Math.max(0, brut - retenue) };
}

/**
 * Répare les montants persistés d'un ancien règlement avant de produire les
 * écritures : retenue + net reste toujours égal au brut, sans double déduction.
 */
export function securiserReglementPpsi(
  brutInput: number,
  retenueInput: number,
  _netInput: number,
): ReglementPpsi {
  const brut = Number.isFinite(brutInput) ? Math.max(0, Math.round(brutInput)) : 0;
  const retenue = Math.min(brut, Math.max(0, Math.round(Number.isFinite(retenueInput) ? retenueInput : 0)));
  return { brut, retenue, net: Math.max(0, brut - retenue) };
}

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
    )).for("update").limit(1);
  if (!charge) return null;

  const isPpsi = charge.categorie === "ppsi";
  const tauxPpsi = isPpsi ? await getTauxPpsi(cooperativeId) : null;
  const brut = Math.round(parseFloat(charge.montantFcfa));
  const reglement = isPpsi ? calculerReglementPpsi(brut, tauxPpsi!) : null;
  const compteParType = {
    caisse: "571",
    banque: "521",
    mobile_marchand: "552",
  } as const;
  const compteCredit = charge.compteCredit;
  const compteTresorerieType = charge.compteTresorerieType as keyof typeof compteParType | null;
  const compteTresorerieId = charge.compteTresorerieId;
  const isCredit = charge.modePaiement === "credit";
  const mouvementTresorerie = !isCredit;

  if (isCredit && compteCredit !== "401") {
    throw new Error("Une charge à crédit doit utiliser le compte 401 — Fournisseurs");
  }
  if (!isCredit && compteCredit === "401") {
    throw new Error("Le compte 401 — Fournisseurs nécessite le mode de paiement « À crédit »");
  }
  if (compteCredit === "401" && !charge.tiers?.trim()) {
    throw new Error("Le fournisseur ou le tiers est requis pour une charge à crédit");
  }
  if (mouvementTresorerie) {
    if (!compteTresorerieType || !compteTresorerieId) {
      throw new Error("Un compte de trésorerie doit être sélectionné avant la validation");
    }
    if (compteParType[compteTresorerieType] !== compteCredit) {
      throw new Error("Le compte de trésorerie sélectionné ne correspond pas au compte crédit");
    }
  } else if (compteTresorerieType || compteTresorerieId) {
    throw new Error("Un compte fournisseur ne peut pas être associé à un mouvement de trésorerie");
  }

  const montantSortie = isPpsi ? reglement!.net : brut;
  const dateOperation = charge.dateCharge;
  const libelleMouvement = `Charge diverse — ${charge.libelle}`;
  const reference = charge.referencePiece ?? `CHD-${charge.id}`;

  return db.transaction(async (tx) => {
    // Recharger et verrouiller la charge dans la transaction : deux validations
    // concurrentes ne doivent jamais créer deux sorties de trésorerie.
    const [chargeVerrouillee] = await tx.select({ id: chargesDiversesTable.id })
      .from(chargesDiversesTable)
      .where(and(
        eq(chargesDiversesTable.id, id),
        eq(chargesDiversesTable.cooperativeId, cooperativeId),
        eq(chargesDiversesTable.statut, "brouillon"),
      ))
      .for("update")
      .limit(1);
    if (!chargeVerrouillee) return null;

    if (mouvementTresorerie && montantSortie > 0) {
      if (compteTresorerieType === "caisse") {
        const [caisse] = await tx.select().from(caissesTable)
          .where(and(
            eq(caissesTable.id, compteTresorerieId!),
            eq(caissesTable.cooperativeId, cooperativeId),
            eq(caissesTable.actif, true),
          ))
          .for("update")
          .limit(1);
        if (!caisse) throw new Error("Caisse introuvable ou inactive");

        const [session] = await tx.select({ id: sessionsCaisseTable.id })
          .from(sessionsCaisseTable)
          .where(and(
            eq(sessionsCaisseTable.caisseId, caisse.id),
            eq(sessionsCaisseTable.dateSession, new Date().toISOString().slice(0, 10)),
            eq(sessionsCaisseTable.statut, "ouverte"),
          ))
          .limit(1);
        if (!session) throw new Error(`Aucune session ouverte sur la caisse "${caisse.nom}"`);

        const solde = parseFloat(String(caisse.soldeActuelFcfa));
        if (solde < montantSortie) {
          throw new Error(`Solde insuffisant en caisse (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
        }
        const nouveauSolde = solde - montantSortie;
        await tx.insert(mouvementsCaisseTable).values({
          caisseId: caisse.id,
          sessionId: session.id,
          cooperativeId,
          type: "sortie",
          motif: "charge_diverse",
          montantFcfa: montantSortie.toString(),
          libelle: libelleMouvement,
          referenceOperation: reference,
          soldeApresFcfa: nouveauSolde.toString(),
          enregistrePar: approvedBy,
        });
        await tx.update(caissesTable)
          .set({ soldeActuelFcfa: nouveauSolde.toString() })
          .where(eq(caissesTable.id, caisse.id));
      } else if (compteTresorerieType === "banque") {
        const [banque] = await tx.select().from(comptesBancairesTable)
          .where(and(
            eq(comptesBancairesTable.id, compteTresorerieId!),
            eq(comptesBancairesTable.cooperativeId, cooperativeId),
            eq(comptesBancairesTable.actif, true),
          ))
          .for("update")
          .limit(1);
        if (!banque) throw new Error("Compte bancaire introuvable ou inactif");

        const solde = parseFloat(String(banque.soldeActuelFcfa));
        if (solde < montantSortie) {
          throw new Error(`Solde bancaire insuffisant (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
        }
        const nouveauSolde = solde - montantSortie;
        await tx.insert(mouvementsBanqueTable).values({
          compteId: banque.id,
          cooperativeId,
          type: "debit",
          motif: "charge_diverse",
          montantFcfa: montantSortie.toString(),
          libelle: libelleMouvement,
          reference,
          dateOperation,
          dateValeur: null,
          soldeApresFcfa: nouveauSolde.toString(),
          enregistrePar: approvedBy,
        });
        await tx.update(comptesBancairesTable)
          .set({ soldeActuelFcfa: nouveauSolde.toString() })
          .where(eq(comptesBancairesTable.id, banque.id));
      } else if (compteTresorerieType === "mobile_marchand") {
        const [mobile] = await tx.select().from(comptesMobilesMarchandsTable)
          .where(and(
            eq(comptesMobilesMarchandsTable.id, compteTresorerieId!),
            eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
            eq(comptesMobilesMarchandsTable.actif, true),
          ))
          .for("update")
          .limit(1);
        if (!mobile) throw new Error("Compte Mobile Marchand introuvable ou inactif");

        const solde = parseFloat(String(mobile.soldeActuelFcfa));
        if (solde < montantSortie) {
          throw new Error(`Solde Mobile Marchand insuffisant (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
        }
        const nouveauSolde = solde - montantSortie;
        await tx.insert(mouvementsMobileMarchandTable).values({
          compteId: mobile.id,
          cooperativeId,
          type: "debit",
          motif: "charge_diverse",
          montantFcfa: montantSortie.toString(),
          libelle: libelleMouvement,
          reference,
          dateOperation,
          soldeApresFcfa: nouveauSolde.toString(),
          enregistrePar: approvedBy,
        });
        await tx.update(comptesMobilesMarchandsTable)
          .set({ soldeActuelFcfa: nouveauSolde.toString() })
          .where(eq(comptesMobilesMarchandsTable.id, mobile.id));
      }
    }

    const [row] = await tx
      .update(chargesDiversesTable)
      .set({
        statut: "valide",
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
        ...(isPpsi ? {
          ppsiTauxPct: tauxPpsi!.toFixed(2),
          retenuePpsiFcfa: reglement!.retenue,
          montantNetFcfa: reglement!.net,
        } : {}),
      })
      .where(and(
        eq(chargesDiversesTable.id, id),
        eq(chargesDiversesTable.cooperativeId, cooperativeId),
        eq(chargesDiversesTable.statut, "brouillon"),
      ))
      .returning();
    return row ?? null;
  });
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
