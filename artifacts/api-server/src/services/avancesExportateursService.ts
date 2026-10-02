import {
  avancesExportateursTable,
  chequesRecusTable,
  db,
  exportateursTable,
  imputationsAvancesExportateursTable,
  ventesExportateursTable,
} from "@workspace/db";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { enregistrerMouvement } from "./banqueService.js";
import { proposerEcrituresDansTransaction } from "./comptabiliteService.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const montantImputeSql = sql<number>`coalesce((
  select sum(${imputationsAvancesExportateursTable.montantFcfa})
  from ${imputationsAvancesExportateursTable}
  where ${imputationsAvancesExportateursTable.avanceExportateurId} = ${avancesExportateursTable.id}
), 0)::int`;

const avanceSummarySelect = {
  id: avancesExportateursTable.id,
  cooperativeId: avancesExportateursTable.cooperativeId,
  exportateurId: avancesExportateursTable.exportateurId,
  exportateurNom: exportateursTable.nom,
  numeroCheque: avancesExportateursTable.numeroCheque,
  banque: avancesExportateursTable.banque,
  montantFcfa: avancesExportateursTable.montantFcfa,
  dateReception: avancesExportateursTable.dateReception,
  dateEcheance: avancesExportateursTable.dateEcheance,
  statut: avancesExportateursTable.statut,
  dateDepot: avancesExportateursTable.dateDepot,
  dateEncaissement: avancesExportateursTable.dateEncaissement,
  dateRejet: avancesExportateursTable.dateRejet,
  motifRejet: avancesExportateursTable.motifRejet,
  dateAnnulation: avancesExportateursTable.dateAnnulation,
  motifAnnulation: avancesExportateursTable.motifAnnulation,
  compteBancaireId: avancesExportateursTable.compteBancaireId,
  mouvementBanqueId: avancesExportateursTable.mouvementBanqueId,
  createdBy: avancesExportateursTable.createdBy,
  createdAt: avancesExportateursTable.createdAt,
  montantImputeFcfa: montantImputeSql,
  montantDisponibleFcfa: sql<number>`case
    when ${avancesExportateursTable.statut} = 'encaisse'
      then greatest(${avancesExportateursTable.montantFcfa} - ${montantImputeSql}, 0)
    else 0
  end::int`,
};

export type CreerAvanceExportateurInput = {
  exportateurId: number;
  numeroCheque: string;
  banque: string;
  montantFcfa: number;
  dateReception: string;
  dateEcheance?: string | null;
  createdBy: number;
};

export async function listAvancesExportateurs(cooperativeId: number) {
  return db
    .select(avanceSummarySelect)
    .from(avancesExportateursTable)
    .innerJoin(exportateursTable, eq(exportateursTable.id, avancesExportateursTable.exportateurId))
    .where(eq(avancesExportateursTable.cooperativeId, cooperativeId))
    .orderBy(
      sql`case ${avancesExportateursTable.statut}
        when 'a_deposer' then 0
        when 'depose' then 1
        when 'encaisse' then 2
        when 'rejete' then 3
        when 'annule' then 4
        else 5 end`,
      desc(avancesExportateursTable.dateReception),
      desc(avancesExportateursTable.createdAt),
    );
}

export async function getAvanceExportateurSummary(id: number, cooperativeId: number) {
  const [row] = await db
    .select(avanceSummarySelect)
    .from(avancesExportateursTable)
    .innerJoin(exportateursTable, eq(exportateursTable.id, avancesExportateursTable.exportateurId))
    .where(and(
      eq(avancesExportateursTable.id, id),
      eq(avancesExportateursTable.cooperativeId, cooperativeId),
      eq(exportateursTable.cooperativeId, cooperativeId),
    ))
    .limit(1);
  return row ?? null;
}

export async function listVentesEligiblesAvanceExportateur(id: number, cooperativeId: number) {
  const avance = await getAvanceExportateurSummary(id, cooperativeId);
  if (!avance) throw new Error("Avance exportateur introuvable");
  if (avance.statut !== "encaisse") return [];

  return db
    .select({
      id: ventesExportateursTable.id,
      dateVente: ventesExportateursTable.dateVente,
      poidsKg: ventesExportateursTable.poidsKg,
      montantTotalFcfa: ventesExportateursTable.montantTotalFcfa,
      montantRecuFcfa: ventesExportateursTable.montantRecuFcfa,
      montantAvanceImputeeFcfa: ventesExportateursTable.montantAvanceImputeeFcfa,
      soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
      statut: ventesExportateursTable.statut,
    })
    .from(ventesExportateursTable)
    .where(and(
      eq(ventesExportateursTable.exportateurId, avance.exportateurId),
      gt(ventesExportateursTable.soldeDuFcfa, 0),
      ne(ventesExportateursTable.statut, "refoule"),
    ))
    .orderBy(desc(ventesExportateursTable.dateVente), desc(ventesExportateursTable.id));
}

export async function getAvanceExportateurDetail(id: number, cooperativeId: number) {
  const avance = await getAvanceExportateurSummary(id, cooperativeId);
  if (!avance) return null;

  const [imputations, ventesEligibles] = await Promise.all([
    db
      .select({
        id: imputationsAvancesExportateursTable.id,
        avanceExportateurId: imputationsAvancesExportateursTable.avanceExportateurId,
        venteExportateurId: imputationsAvancesExportateursTable.venteExportateurId,
        dateVente: ventesExportateursTable.dateVente,
        montantFcfa: imputationsAvancesExportateursTable.montantFcfa,
        dateImputation: imputationsAvancesExportateursTable.dateImputation,
        createdBy: imputationsAvancesExportateursTable.createdBy,
        createdAt: imputationsAvancesExportateursTable.createdAt,
      })
      .from(imputationsAvancesExportateursTable)
      .innerJoin(
        ventesExportateursTable,
        eq(ventesExportateursTable.id, imputationsAvancesExportateursTable.venteExportateurId),
      )
      .where(and(
        eq(imputationsAvancesExportateursTable.avanceExportateurId, id),
        eq(ventesExportateursTable.exportateurId, avance.exportateurId),
      ))
      .orderBy(desc(imputationsAvancesExportateursTable.createdAt)),
    listVentesEligiblesAvanceExportateur(id, cooperativeId),
  ]);

  return { avance, imputations, ventesEligibles };
}

export async function creerAvanceExportateur(
  cooperativeId: number,
  data: CreerAvanceExportateurInput,
) {
  return db.transaction(async (tx) => {
    const [exportateur] = await tx
      .select({ id: exportateursTable.id, nom: exportateursTable.nom })
      .from(exportateursTable)
      .where(and(
        eq(exportateursTable.id, data.exportateurId),
        eq(exportateursTable.cooperativeId, cooperativeId),
      ))
      .limit(1);
    if (!exportateur) throw new Error("Exportateur introuvable");

    const [duplicateAvance] = await tx
      .select({ id: avancesExportateursTable.id })
      .from(avancesExportateursTable)
      .where(and(
        eq(avancesExportateursTable.cooperativeId, cooperativeId),
        eq(avancesExportateursTable.numeroCheque, data.numeroCheque),
      ))
      .limit(1);
    const [duplicateCheque] = await tx
      .select({ id: chequesRecusTable.id })
      .from(chequesRecusTable)
      .where(and(
        eq(chequesRecusTable.cooperativeId, cooperativeId),
        eq(chequesRecusTable.numeroCheque, data.numeroCheque),
      ))
      .limit(1);
    if (duplicateAvance || duplicateCheque) {
      throw new Error("Ce numéro de chèque existe déjà pour cette coopérative");
    }

    const [created] = await tx
      .insert(avancesExportateursTable)
      .values({
        cooperativeId,
        exportateurId: exportateur.id,
        numeroCheque: data.numeroCheque,
        banque: data.banque,
        montantFcfa: data.montantFcfa,
        dateReception: data.dateReception,
        dateEcheance: data.dateEcheance ?? null,
        createdBy: data.createdBy,
      })
      .returning();
    if (!created) throw new Error("L'avance exportateur n'a pas pu être créée");

    await proposerEcrituresDansTransaction(tx, cooperativeId, [{
      source: "avance_exportateur",
      sourceId: created.id,
      libelle: `Chèque d'avance reçu — ${exportateur.nom} — n°${created.numeroCheque}`,
      compteDebit: "511",
      compteCredit: "4191",
      montantFcfa: created.montantFcfa,
      date: created.dateReception,
      numeroPiece: `AVEX-${created.id}`,
      tiersId: exportateur.id,
      tiersType: "exportateur",
    }]);

    return created;
  });
}

export async function deposerAvanceExportateur(
  id: number,
  cooperativeId: number,
  dateDepot?: string,
) {
  return db.transaction(async (tx) => {
    const [avance] = await tx
      .select()
      .from(avancesExportateursTable)
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!avance) throw new Error("Avance exportateur introuvable");
    if (avance.statut !== "a_deposer") {
      throw new Error("Seul un chèque d'avance à déposer peut être déposé");
    }
    const [updated] = await tx
      .update(avancesExportateursTable)
      .set({ statut: "depose", dateDepot: dateDepot ?? today() })
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.statut, "a_deposer"),
      ))
      .returning({ id: avancesExportateursTable.id });
    if (!updated) throw new Error("Seul un chèque d'avance à déposer peut être déposé");
    return updated;
  });
}

export async function encaisserAvanceExportateur(
  id: number,
  cooperativeId: number,
  data: { compteBancaireId: number; dateEncaissement?: string },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [avance] = await tx
      .select()
      .from(avancesExportateursTable)
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!avance) throw new Error("Avance exportateur introuvable");
    if (avance.statut !== "depose") {
      throw new Error("Le chèque d'avance doit être déposé avant son encaissement");
    }

    const dateEncaissement = data.dateEncaissement ?? today();
    const { mouvement } = await enregistrerMouvement(data.compteBancaireId, cooperativeId, {
      type: "credit",
      motif: "encaissement_cheque_recu",
      montantFcfa: avance.montantFcfa,
      libelle: `Encaissement chèque d'avance — n°${avance.numeroCheque}`,
      reference: avance.numeroCheque,
      dateOperation: dateEncaissement,
      userId,
    }, tx);

    const [updated] = await tx
      .update(avancesExportateursTable)
      .set({
        statut: "encaisse",
        dateEncaissement,
        compteBancaireId: data.compteBancaireId,
        mouvementBanqueId: mouvement.id,
      })
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.statut, "depose"),
      ))
      .returning({ id: avancesExportateursTable.id });
    if (!updated) throw new Error("Le chèque d'avance doit être déposé avant son encaissement");
    return updated;
  });
}

export async function imputerAvanceExportateur(
  id: number,
  cooperativeId: number,
  data: { venteExportateurId: number; montantFcfa: number },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [avance] = await tx
      .select()
      .from(avancesExportateursTable)
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!avance) throw new Error("Avance exportateur introuvable");
    if (avance.statut !== "encaisse") {
      throw new Error("Seule une avance encaissée peut être imputée");
    }

    const [exportateur] = await tx
      .select({ id: exportateursTable.id })
      .from(exportateursTable)
      .where(and(
        eq(exportateursTable.id, avance.exportateurId),
        eq(exportateursTable.cooperativeId, cooperativeId),
      ))
      .limit(1);
    if (!exportateur) throw new Error("Avance exportateur introuvable");

    const [vente] = await tx
      .select()
      .from(ventesExportateursTable)
      .where(eq(ventesExportateursTable.id, data.venteExportateurId))
      .for("update")
      .limit(1);
    if (!vente) throw new Error("Vente exportateur introuvable");
    if (vente.exportateurId !== avance.exportateurId || vente.statut === "refoule") {
      throw new Error("L'imputation doit viser une vente réelle du même exportateur");
    }
    if (vente.soldeDuFcfa <= 0) throw new Error("La vente n'a plus de solde à compenser");
    if (data.montantFcfa > vente.soldeDuFcfa) {
      throw new Error(`Le montant dépasse le solde de la vente (${vente.soldeDuFcfa.toLocaleString("fr-FR")} FCFA)`);
    }

    const [allocationTotals] = await tx
      .select({
        montantImputeFcfa: sql<number>`coalesce(sum(${imputationsAvancesExportateursTable.montantFcfa}), 0)::int`,
      })
      .from(imputationsAvancesExportateursTable)
      .where(eq(imputationsAvancesExportateursTable.avanceExportateurId, id));
    const montantDisponible = Math.max(0, avance.montantFcfa - Number(allocationTotals?.montantImputeFcfa ?? 0));
    if (data.montantFcfa > montantDisponible) {
      throw new Error(`Le montant dépasse le solde disponible de l'avance (${montantDisponible.toLocaleString("fr-FR")} FCFA)`);
    }

    const dateImputation = today();
    const [imputation] = await tx
      .insert(imputationsAvancesExportateursTable)
      .values({
        avanceExportateurId: id,
        venteExportateurId: vente.id,
        montantFcfa: data.montantFcfa,
        dateImputation,
        createdBy: userId,
      })
      .returning();
    if (!imputation) throw new Error("L'imputation de l'avance n'a pas pu être créée");

    const nouveauSolde = Math.max(0, vente.soldeDuFcfa - data.montantFcfa);
    const statut: "en_attente" | "partiel" | "regle" | "en_retard" =
      nouveauSolde === 0
        ? "regle"
        : vente.dateEcheanceReglement && vente.dateEcheanceReglement < dateImputation
          ? "en_retard"
          : "partiel";
    const [updatedVente] = await tx
      .update(ventesExportateursTable)
      .set({
        montantAvanceImputeeFcfa: vente.montantAvanceImputeeFcfa + data.montantFcfa,
        soldeDuFcfa: nouveauSolde,
        statut,
      })
      .where(eq(ventesExportateursTable.id, vente.id))
      .returning({ id: ventesExportateursTable.id });
    if (!updatedVente) throw new Error("La vente n'a pas pu être mise à jour");

    await proposerEcrituresDansTransaction(tx, cooperativeId, [{
      source: "avance_exportateur",
      sourceId: avance.id,
      libelle: `Imputation avance exportateur — vente #${vente.id}`,
      compteDebit: "4191",
      compteCredit: "4111",
      montantFcfa: data.montantFcfa,
      date: dateImputation,
      numeroPiece: `IMPVX-${imputation.id}`,
      tiersId: avance.exportateurId,
      tiersType: "exportateur",
    }]);

    return { ...imputation, dateVente: vente.dateVente };
  });
}

async function terminerAvanceExportateur(
  id: number,
  cooperativeId: number,
  action: "rejete" | "annule",
  motif: string,
  dateAction?: string,
) {
  return db.transaction(async (tx) => {
    const [avance] = await tx
      .select()
      .from(avancesExportateursTable)
      .where(and(
        eq(avancesExportateursTable.id, id),
        eq(avancesExportateursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!avance) throw new Error("Avance exportateur introuvable");
    if (avance.statut !== "a_deposer" && avance.statut !== "depose") {
      throw new Error("Seul un chèque d'avance à déposer ou déposé peut être rejeté ou annulé");
    }

    const dateOperation = dateAction ?? today();
    const [updated] = await tx
      .update(avancesExportateursTable)
      .set(action === "rejete"
        ? { statut: "rejete", dateRejet: dateOperation, motifRejet: motif }
        : { statut: "annule", dateAnnulation: dateOperation, motifAnnulation: motif })
      .where(and(
        eq(avancesExportateursTable.id, id),
        sql`${avancesExportateursTable.statut} in ('a_deposer', 'depose')`,
      ))
      .returning({ id: avancesExportateursTable.id });
    if (!updated) throw new Error("Le chèque d'avance a déjà changé de statut");

    const [exportateur] = await tx
      .select({ id: exportateursTable.id, nom: exportateursTable.nom })
      .from(exportateursTable)
      .where(and(
        eq(exportateursTable.id, avance.exportateurId),
        eq(exportateursTable.cooperativeId, cooperativeId),
      ))
      .limit(1);
    if (!exportateur) throw new Error("Avance exportateur introuvable");

    await proposerEcrituresDansTransaction(tx, cooperativeId, [{
      source: "avance_exportateur",
      sourceId: avance.id,
      libelle: `${action === "rejete" ? "Rejet" : "Annulation"} chèque d'avance n°${avance.numeroCheque} — ${exportateur.nom}`,
      compteDebit: "4191",
      compteCredit: "511",
      montantFcfa: avance.montantFcfa,
      date: dateOperation,
      numeroPiece: `${action === "rejete" ? "REJ" : "ANN"}-AVEX-${avance.id}`,
      tiersId: exportateur.id,
      tiersType: "exportateur",
    }]);

    return updated;
  });
}

export function rejeterAvanceExportateur(
  id: number,
  cooperativeId: number,
  data: { motifRejet: string; dateRejet?: string },
) {
  return terminerAvanceExportateur(id, cooperativeId, "rejete", data.motifRejet, data.dateRejet);
}

export function annulerAvanceExportateur(
  id: number,
  cooperativeId: number,
  motifAnnulation: string,
) {
  return terminerAvanceExportateur(id, cooperativeId, "annule", motifAnnulation);
}