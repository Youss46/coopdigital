import {
  db,
  chequesRecusTable,
  exportateursTable,
  ventesExportateursTable,
  paiementsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { enregistrerMouvement } from "./banqueService.js";
import {
  proposerEcrituresDansTransaction,
  type ComptabiliteTransaction,
} from "./comptabiliteService.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const chequeSelect = {
  id: chequesRecusTable.id,
  cooperativeId: chequesRecusTable.cooperativeId,
  numeroCheque: chequesRecusTable.numeroCheque,
  banque: chequesRecusTable.banque,
  montantFcfa: chequesRecusTable.montantFcfa,
  dateReception: chequesRecusTable.dateReception,
  dateEcheance: chequesRecusTable.dateEcheance,
  statut: chequesRecusTable.statut,
  dateDepot: chequesRecusTable.dateDepot,
  dateEncaissement: chequesRecusTable.dateEncaissement,
  dateRejet: chequesRecusTable.dateRejet,
  motifRejet: chequesRecusTable.motifRejet,
  dateAnnulation: chequesRecusTable.dateAnnulation,
  motifAnnulation: chequesRecusTable.motifAnnulation,
  compteBancaireId: chequesRecusTable.compteBancaireId,
  mouvementBanqueId: chequesRecusTable.mouvementBanqueId,
  venteExportateurId: chequesRecusTable.venteExportateurId,
  exportateurId: chequesRecusTable.exportateurId,
  paiementId: chequesRecusTable.paiementId,
  paiementLigneId: chequesRecusTable.paiementLigneId,
  exportateurNom: exportateursTable.nom,
  createdBy: chequesRecusTable.createdBy,
  createdAt: chequesRecusTable.createdAt,
};

export async function listChequesRecus(cooperativeId: number, statut?: string) {
  const conditions = [eq(chequesRecusTable.cooperativeId, cooperativeId)];
  if (statut) {
    conditions.push(eq(
      chequesRecusTable.statut,
      statut as "a_deposer" | "depose" | "encaisse" | "rejete" | "annule",
    ));
  }
  return db
    .select(chequeSelect)
    .from(chequesRecusTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, chequesRecusTable.exportateurId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${chequesRecusTable.statut}
        WHEN 'a_deposer' THEN 0
        WHEN 'depose' THEN 1
        WHEN 'rejete' THEN 2
        WHEN 'encaisse' THEN 3
        WHEN 'annule' THEN 4
        ELSE 5 END`,
      desc(chequesRecusTable.dateReception),
      desc(chequesRecusTable.createdAt),
    );
}

export async function getChequeRecu(id: number, cooperativeId: number) {
  const [row] = await db
    .select(chequeSelect)
    .from(chequesRecusTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, chequesRecusTable.exportateurId))
    .where(and(eq(chequesRecusTable.id, id), eq(chequesRecusTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function deposerChequeRecu(
  id: number,
  cooperativeId: number,
  dateDepot?: string,
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesRecusTable)
      .where(and(eq(chequesRecusTable.id, id), eq(chequesRecusTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!cheque) throw new Error("Chèque reçu introuvable");
    if (cheque.statut !== "a_deposer") throw new Error("Seul un chèque à déposer peut être déposé");
    const [updated] = await tx.update(chequesRecusTable)
      .set({ statut: "depose", dateDepot: dateDepot ?? today() })
      .where(eq(chequesRecusTable.id, id))
      .returning();
    return updated!;
  });
}

export async function encaisserChequeRecu(
  id: number,
  cooperativeId: number,
  data: { compteBancaireId: number; dateEncaissement?: string },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesRecusTable)
      .where(and(eq(chequesRecusTable.id, id), eq(chequesRecusTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!cheque) throw new Error("Chèque reçu introuvable");
    if (cheque.statut !== "depose") throw new Error("Le chèque doit être déposé avant son encaissement");

    const dateEncaissement = data.dateEncaissement ?? today();
    const { mouvement } = await enregistrerMouvement(data.compteBancaireId, cooperativeId, {
      type: "credit",
      motif: "encaissement_cheque_recu",
      montantFcfa: cheque.montantFcfa,
      libelle: `Encaissement chèque reçu — n°${cheque.numeroCheque}`,
      reference: cheque.numeroCheque,
      dateOperation: dateEncaissement,
      userId,
    }, tx);

    const [updated] = await tx.update(chequesRecusTable)
      .set({
        statut: "encaisse",
        dateEncaissement,
        compteBancaireId: data.compteBancaireId,
        mouvementBanqueId: mouvement.id,
      })
      .where(and(
        eq(chequesRecusTable.id, id),
        eq(chequesRecusTable.statut, "depose"),
      ))
      .returning();
    if (!updated) {
      throw new Error("Le chèque doit être déposé avant son encaissement");
    }
    if (cheque.paiementId) {
      await tx.update(paiementsTable)
        .set({ statut: "effectue", dateValidation: new Date() })
        .where(eq(paiementsTable.id, cheque.paiementId));
    }
    return updated!;
  });
}

export async function rejeterChequeRecu(
  id: number,
  cooperativeId: number,
  data: { motifRejet: string; dateRejet?: string },
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesRecusTable)
      .where(and(eq(chequesRecusTable.id, id), eq(chequesRecusTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!cheque) throw new Error("Chèque reçu introuvable");
    if (cheque.statut !== "a_deposer" && cheque.statut !== "depose") {
      throw new Error("Seul un chèque à déposer ou déposé peut être rejeté");
    }
    const dateRejet = data.dateRejet ?? today();
    const [updated] = await tx.update(chequesRecusTable).set({
      statut: "rejete",
      dateRejet,
      motifRejet: data.motifRejet,
    }).where(and(
      eq(chequesRecusTable.id, id),
      inArray(chequesRecusTable.statut, ["a_deposer", "depose"]),
    )).returning();
    if (!updated) {
      throw new Error("Seul un chèque à déposer ou déposé peut être rejeté");
    }

    const [vente] = await tx.select()
      .from(ventesExportateursTable)
      .where(eq(ventesExportateursTable.id, cheque.venteExportateurId))
      .for("update")
      .limit(1);
    if (vente) {
      const montantRecu = Math.max(0, vente.montantRecuFcfa - cheque.montantFcfa);
      const solde = Math.max(0, vente.montantTotalFcfa - montantRecu);
      const statut = solde === 0
        ? "regle"
        : vente.dateEcheanceReglement && new Date(vente.dateEcheanceReglement) < new Date()
          ? "en_retard"
          : montantRecu > 0 ? "partiel" : "en_attente";
      await tx.update(ventesExportateursTable).set({
        montantRecuFcfa: montantRecu,
        soldeDuFcfa: solde,
        statut,
      }).where(eq(ventesExportateursTable.id, vente.id));
    }
    if (cheque.paiementId) {
      await tx.update(paiementsTable)
        .set({ statut: "rejete", motifRejet: data.motifRejet, dateValidation: new Date() })
        .where(eq(paiementsTable.id, cheque.paiementId));
    }

    const [ventePourComptabilite] = await tx
      .select({
        exportateurId: ventesExportateursTable.exportateurId,
        exportateurNom: exportateursTable.nom,
      })
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, cheque.venteExportateurId))
      .limit(1);
    if (ventePourComptabilite) {
      await proposerEcrituresDansTransaction(tx, cooperativeId, [{
        source: "encaissement",
        sourceId: cheque.id,
        libelle: `Rejet chèque reçu n°${cheque.numeroCheque} — ${ventePourComptabilite.exportateurNom ?? "Exportateur"}`,
        compteDebit: "4111",
        compteCredit: "511",
        montantFcfa: cheque.montantFcfa,
        date: dateRejet,
        numeroPiece: `REJ-CHQ-${cheque.id}`,
        tiersId: ventePourComptabilite.exportateurId,
        tiersType: "exportateur",
      }]);
    }
    return { ...cheque, statut: "rejete" as const, dateRejet, motifRejet: data.motifRejet };
  });
}

export async function annulerChequeRecu(
  id: number,
  cooperativeId: number,
  motifAnnulation: string,
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesRecusTable)
      .where(and(eq(chequesRecusTable.id, id), eq(chequesRecusTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!cheque) throw new Error("Chèque reçu introuvable");
    if (cheque.statut !== "a_deposer" && cheque.statut !== "depose") {
      throw new Error("Seul un chèque à déposer ou déposé peut être annulé");
    }
    const [updated] = await tx.update(chequesRecusTable).set({
      statut: "annule",
      dateAnnulation: today(),
      motifAnnulation,
    }).where(and(
      eq(chequesRecusTable.id, id),
      inArray(chequesRecusTable.statut, ["a_deposer", "depose"]),
    )).returning();
    if (!updated) {
      throw new Error("Seul un chèque à déposer ou déposé peut être annulé");
    }
    const [vente] = await tx.select()
      .from(ventesExportateursTable)
      .where(eq(ventesExportateursTable.id, cheque.venteExportateurId))
      .for("update")
      .limit(1);
    if (vente) {
      const montantRecu = Math.max(0, vente.montantRecuFcfa - cheque.montantFcfa);
      const solde = Math.max(0, vente.montantTotalFcfa - montantRecu);
      const statut = solde === 0
        ? "regle"
        : vente.dateEcheanceReglement && new Date(vente.dateEcheanceReglement) < new Date()
          ? "en_retard"
          : montantRecu > 0 ? "partiel" : "en_attente";
      await tx.update(ventesExportateursTable).set({
        montantRecuFcfa: montantRecu,
        soldeDuFcfa: solde,
        statut,
      }).where(eq(ventesExportateursTable.id, vente.id));
    }
    if (cheque.paiementId) {
      await tx.update(paiementsTable)
        .set({ statut: "rejete", motifRejet: motifAnnulation, dateValidation: new Date() })
        .where(eq(paiementsTable.id, cheque.paiementId));
    }
    const dateAnnulation = today();
    const [ventePourComptabilite] = await tx.select({
      exportateurId: ventesExportateursTable.exportateurId,
      exportateurNom: exportateursTable.nom,
    }).from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, cheque.venteExportateurId))
      .limit(1);
    if (ventePourComptabilite) {
      await proposerEcrituresDansTransaction(tx, cooperativeId, [{
        source: "encaissement",
        sourceId: cheque.id,
        libelle: `Annulation chèque reçu n°${cheque.numeroCheque} — ${ventePourComptabilite.exportateurNom ?? "Exportateur"}`,
        compteDebit: "4111",
        compteCredit: "511",
        montantFcfa: cheque.montantFcfa,
        date: dateAnnulation,
        numeroPiece: `ANN-CHQ-${cheque.id}`,
        tiersId: ventePourComptabilite.exportateurId,
        tiersType: "exportateur",
      }]);
    }
    return updated!;
  });
}

export type ChequeRecuInsert = {
  cooperativeId: number;
  numeroCheque: string;
  banque: string;
  montantFcfa: number;
  dateReception: string;
  dateEcheance?: string | null;
  venteExportateurId: number;
  exportateurId: number;
  paiementId: number;
  paiementLigneId: number;
  createdBy: number;
};

export async function creerChequeRecuDansTransaction(
  tx: ComptabiliteTransaction,
  data: ChequeRecuInsert,
) {
  const [created] = await tx.insert(chequesRecusTable).values({
    ...data,
    dateEcheance: data.dateEcheance ?? null,
    statut: "a_deposer",
  }).returning();
  if (!created) throw new Error("Le chèque reçu n'a pas pu être créé");
  return created;
}