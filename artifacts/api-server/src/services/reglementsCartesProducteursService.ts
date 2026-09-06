import {
  db,
  reglementsCartesProducteursTable,
  comptesBancairesTable,
  paiementsTable,
  membresTable,
  livraisonsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { enregistrerMouvement } from "./banqueService.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listReglementsCartesProducteurs(cooperativeId: number, statut?: string) {
  const conditions = [
    eq(reglementsCartesProducteursTable.cooperativeId, cooperativeId),
  ];
  if (statut && ["en_attente", "paye", "rejete", "annule"].includes(statut)) {
    conditions.push(eq(reglementsCartesProducteursTable.statut, statut as "en_attente" | "paye" | "rejete" | "annule"));
  }

  return db
    .select({
      id: reglementsCartesProducteursTable.id,
      cooperativeId: reglementsCartesProducteursTable.cooperativeId,
      paiementId: reglementsCartesProducteursTable.paiementId,
      paiementLigneId: reglementsCartesProducteursTable.paiementLigneId,
      membreId: reglementsCartesProducteursTable.membreId,
      livraisonId: reglementsCartesProducteursTable.livraisonId,
      numeroCarteSnapshot: reglementsCartesProducteursTable.numeroCarteSnapshot,
      beneficiaire: reglementsCartesProducteursTable.beneficiaire,
      montantFcfa: reglementsCartesProducteursTable.montantFcfa,
      statut: reglementsCartesProducteursTable.statut,
      compteBancaireId: reglementsCartesProducteursTable.compteBancaireId,
      dateCreation: reglementsCartesProducteursTable.dateCreation,
      datePaiement: reglementsCartesProducteursTable.datePaiement,
      dateRejet: reglementsCartesProducteursTable.dateRejet,
      motifRejet: reglementsCartesProducteursTable.motifRejet,
      motifAnnulation: reglementsCartesProducteursTable.motifAnnulation,
      mouvementBanqueId: reglementsCartesProducteursTable.mouvementBanqueId,
      createdAt: reglementsCartesProducteursTable.createdAt,
      nomCompteBancaire: comptesBancairesTable.nom,
      nomMembre: membresTable.nom,
      prenomsMembre: membresTable.prenoms,
      statutPaiement: paiementsTable.statut,
      montantRestantLivraison: sql<number | null>`coalesce(${livraisonsTable.montantRestant}, 0)::integer`,
    })
    .from(reglementsCartesProducteursTable)
    .leftJoin(comptesBancairesTable, eq(reglementsCartesProducteursTable.compteBancaireId, comptesBancairesTable.id))
    .leftJoin(paiementsTable, eq(reglementsCartesProducteursTable.paiementId, paiementsTable.id))
    .leftJoin(membresTable, eq(reglementsCartesProducteursTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(reglementsCartesProducteursTable.livraisonId, livraisonsTable.id))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${reglementsCartesProducteursTable.statut}
        WHEN 'en_attente' THEN 0
        WHEN 'paye' THEN 1
        WHEN 'rejete' THEN 2
        WHEN 'annule' THEN 3
        ELSE 4
      END`,
      desc(reglementsCartesProducteursTable.createdAt),
    );
}

export async function payerReglementCarteProducteur(
  id: number,
  cooperativeId: number,
  data: { compteBancaireId: number; datePaiement?: string },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [reglement] = await tx
      .select()
      .from(reglementsCartesProducteursTable)
      .where(and(
        eq(reglementsCartesProducteursTable.id, id),
        eq(reglementsCartesProducteursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);

    if (!reglement) throw new Error("Règlement carte producteur introuvable");
    if (reglement.statut !== "en_attente") {
      throw new Error("Seul un règlement carte producteur en attente peut être marqué payé");
    }

    const datePaiement = data.datePaiement ?? today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePaiement)) {
      throw new Error("La date de paiement doit être au format AAAA-MM-JJ");
    }

    const { mouvement } = await enregistrerMouvement(data.compteBancaireId, cooperativeId, {
      type: "debit",
      motif: "paiement_carte_producteur",
      montantFcfa: reglement.montantFcfa,
      libelle: `Paiement carte producteur — ${reglement.beneficiaire}`,
      reference: `CARTE-${reglement.id}`,
      dateOperation: datePaiement,
      userId,
    }, tx);

    const [updated] = await tx
      .update(reglementsCartesProducteursTable)
      .set({
        statut: "paye",
        compteBancaireId: data.compteBancaireId,
        datePaiement,
        mouvementBanqueId: mouvement.id,
        paidBy: userId,
      })
      .where(and(
        eq(reglementsCartesProducteursTable.id, id),
        eq(reglementsCartesProducteursTable.cooperativeId, cooperativeId),
        eq(reglementsCartesProducteursTable.statut, "en_attente"),
      ))
      .returning();

    if (!updated) throw new Error("Ce règlement carte producteur a déjà été traité");

    await tx
      .update(paiementsTable)
      .set({ statut: "effectue", dateValidation: new Date() })
      .where(and(
        eq(paiementsTable.id, reglement.paiementId),
        eq(paiementsTable.cooperativeId, cooperativeId),
      ));

    return updated;
  });
}

export async function rejeterReglementCarteProducteur(
  id: number,
  cooperativeId: number,
  motifRejet: string,
) {
  return db.transaction(async (tx) => {
    const [reglement] = await tx
      .select()
      .from(reglementsCartesProducteursTable)
      .where(and(
        eq(reglementsCartesProducteursTable.id, id),
        eq(reglementsCartesProducteursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!reglement) throw new Error("Règlement carte producteur introuvable");
    if (reglement.statut !== "en_attente") throw new Error("Seul un règlement carte producteur en attente peut être rejeté");

    const [updated] = await tx.update(reglementsCartesProducteursTable)
      .set({ statut: "rejete", dateRejet: today(), motifRejet })
      .where(eq(reglementsCartesProducteursTable.id, id))
      .returning();

    await tx.update(paiementsTable)
      .set({
        statut: "en_attente",
        motifRejet: `Carte producteur rejetée : ${motifRejet}`,
        validePar: null,
        dateValidation: null,
      })
      .where(eq(paiementsTable.id, reglement.paiementId));

    if (reglement.livraisonId) {
      await tx.update(livraisonsTable)
        .set({ statutPaiement: "EN_ATTENTE" })
        .where(eq(livraisonsTable.id, reglement.livraisonId));
    }
    return updated;
  });
}

export async function annulerReglementCarteProducteur(
  id: number,
  cooperativeId: number,
  motifAnnulation: string,
) {
  return db.transaction(async (tx) => {
    const [reglement] = await tx
      .select()
      .from(reglementsCartesProducteursTable)
      .where(and(
        eq(reglementsCartesProducteursTable.id, id),
        eq(reglementsCartesProducteursTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);
    if (!reglement) throw new Error("Règlement carte producteur introuvable");
    if (reglement.statut !== "en_attente") throw new Error("Seul un règlement carte producteur en attente peut être annulé");

    const [updated] = await tx.update(reglementsCartesProducteursTable)
      .set({ statut: "annule", motifAnnulation })
      .where(eq(reglementsCartesProducteursTable.id, id))
      .returning();

    await tx.update(paiementsTable)
      .set({
        statut: "en_attente",
        motifRejet: `Carte producteur annulée : ${motifAnnulation}`,
        validePar: null,
        dateValidation: null,
      })
      .where(eq(paiementsTable.id, reglement.paiementId));

    if (reglement.livraisonId) {
      await tx.update(livraisonsTable)
        .set({ statutPaiement: "EN_ATTENTE" })
        .where(eq(livraisonsTable.id, reglement.livraisonId));
    }
    return updated;
  });
}