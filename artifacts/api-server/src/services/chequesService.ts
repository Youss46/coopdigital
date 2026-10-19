import {
  db,
  chequesEmisTable,
  comptesBancairesTable,
  paiementsTable,
  paiementLignesTable,
  livraisonsTable,
  membresTable,
  fournisseursTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { enregistrerMouvement } from "./banqueService.js";
import { proposerEcrituresDansTransaction } from "./comptabiliteService.js";
import { genererNumeroRecuDansTransaction } from "./recuService.js";

function today(): string { return new Date().toISOString().slice(0, 10); }

type ChequeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function traiterPaiementApresRetourCheque(
  tx: ChequeTransaction,
  cheque: {
    id: number;
    paiementId: number | null;
    paiementLigneId: number | null;
    numeroCheque: string | null;
    montantFcfa: number;
    livraisonId: number | null;
    membreId: number | null;
    beneficiaire: string;
  },
  cooperativeId: number,
  motif: string,
): Promise<{ livraisonId: number | null } | null> {
  if (cheque.paiementId == null) return null;

  const [paiement] = await tx
    .select({
      id: paiementsTable.id,
      cooperativeId: paiementsTable.cooperativeId,
      livraisonId: paiementsTable.livraisonId,
      bonCarburantId: paiementsTable.bonCarburantId,
      depenseVehiculeId: paiementsTable.depenseVehiculeId,
      membreId: paiementsTable.membreId,
      campagneId: paiementsTable.campagneId,
      libelle: paiementsTable.libelle,
      montantFcfa: paiementsTable.montantFcfa,
      modePaiement: paiementsTable.modePaiement,
      referenceTransaction: paiementsTable.referenceTransaction,
      statut: paiementsTable.statut,
    })
    .from(paiementsTable)
    .where(eq(paiementsTable.id, cheque.paiementId))
    .for("update")
    .limit(1);

  if (!paiement) return null;

  const lignes = await tx
    .select({
      id: paiementLignesTable.id,
      modePaiement: paiementLignesTable.modePaiement,
      montantFcfa: paiementLignesTable.montantFcfa,
      numeroCheque: paiementLignesTable.numeroCheque,
      referenceTransaction: paiementLignesTable.referenceTransaction,
    })
    .from(paiementLignesTable)
    .where(eq(paiementLignesTable.paiementId, paiement.id))
    .orderBy(paiementLignesTable.id);

  const ligneChequeIndex = lignes.findIndex((ligne) =>
    cheque.paiementLigneId != null
      ? ligne.id === cheque.paiementLigneId
      : ligne.modePaiement === "cheque"
        && ligne.montantFcfa === cheque.montantFcfa
        && (!cheque.numeroCheque || ligne.numeroCheque === cheque.numeroCheque),
  );
  const paiementVentile = lignes.length > 1 || (paiement.modePaiement == null && lignes.length > 0);

  if (paiementVentile) {
    const ligneCheque = ligneChequeIndex >= 0 ? lignes[ligneChequeIndex] : null;
    if (!ligneCheque || ligneCheque.modePaiement !== "cheque") {
      throw new Error("Ligne de chèque introuvable dans le règlement ventilé");
    }

    const lignesConservees = lignes.filter((ligne) => ligne.id !== ligneCheque.id);
    const montantConserve = lignesConservees.reduce((total, ligne) => total + ligne.montantFcfa, 0);
    await tx.delete(paiementLignesTable).where(eq(paiementLignesTable.id, ligneCheque.id));
    await tx
      .update(paiementsTable)
      .set({
        montantFcfa: montantConserve,
        ...(montantConserve === 0
          ? { statut: "rejete", motifRejet: motif }
          : {}),
      })
      .where(eq(paiementsTable.id, paiement.id));

    const numeroRecu = await genererNumeroRecuDansTransaction(cooperativeId, tx);
    await tx.insert(paiementsTable).values({
      cooperativeId: paiement.cooperativeId ?? cooperativeId,
      livraisonId: paiement.livraisonId ?? cheque.livraisonId,
      bonCarburantId: paiement.bonCarburantId,
      // Une dépense véhicule ne peut être liée qu'à un règlement (contrainte unique).
      depenseVehiculeId: null,
      membreId: paiement.membreId ?? cheque.membreId,
      campagneId: paiement.campagneId,
      libelle: paiement.depenseVehiculeId != null
        ? paiement.libelle ?? cheque.beneficiaire
        : paiement.libelle,
      montantFcfa: cheque.montantFcfa,
      modePaiement: null,
      statut: "en_attente",
      numeroRecu,
    });
  } else {
    await tx
      .update(paiementsTable)
      .set({
        statut: "en_attente",
        motifRejet: motif,
        validePar: null,
        dateValidation: null,
        modePaiement: null,
        referenceTransaction: null,
      })
      .where(eq(paiementsTable.id, cheque.paiementId));
  }

  let compteDette = paiement.bonCarburantId
    ? "6042"
    : paiement.depenseVehiculeId
      ? "624"
      : "401";
  const livraisonId = paiement.livraisonId ?? cheque.livraisonId;
  if (!paiement.bonCarburantId && !paiement.depenseVehiculeId && livraisonId != null) {
    const [livraison] = await tx
      .select({ compteDetteProducteur: livraisonsTable.compteDetteProducteur })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.id, livraisonId))
      .for("update")
      .limit(1);
    compteDette = livraison?.compteDetteProducteur?.trim() || "401";
  }
  await proposerEcrituresDansTransaction(tx, cooperativeId, [{
    source: "paiement",
    sourceId: paiement.id,
    libelle: `Extourne du chèque ${cheque.numeroCheque ?? cheque.paiementLigneId ?? cheque.paiementId}`,
    compteDebit: "521",
    compteCredit: compteDette,
    montantFcfa: cheque.montantFcfa,
    date: today(),
    numeroPiece: `PAI-${paiement.id}-CHQ-${cheque.id}`,
    tiersId: paiement.bonCarburantId || paiement.depenseVehiculeId
      ? undefined
      : (paiement.membreId ?? cheque.membreId ?? undefined),
    tiersType: paiement.bonCarburantId || paiement.depenseVehiculeId ? undefined : "membre",
  }]);
  return { livraisonId: paiement.livraisonId ?? cheque.livraisonId };
}

async function restaurerSoldeLivraisonApresRetourCheque(
  tx: ChequeTransaction,
  cheque: { livraisonId: number | null; montantFcfa: number },
) {
  if (cheque.livraisonId == null) return;

  const [livraison] = await tx
    .select({
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      montantRestant: livraisonsTable.montantRestant,
    })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.id, cheque.livraisonId))
    .for("update")
    .limit(1);

  if (!livraison) throw new Error("Livraison liée au chèque introuvable");

  const montantNet = Math.max(0, Math.round(Number(livraison.montantNetFcfa ?? cheque.montantFcfa)));
  const montantRestant = Math.max(0, Math.round(Number(livraison.montantRestant ?? montantNet)));
  const montantRestantRestaure = Math.min(
    montantNet,
    montantRestant + Math.max(0, Math.round(Number(cheque.montantFcfa))),
  );

  await tx
    .update(livraisonsTable)
    .set({
      statutPaiement: montantRestantRestaure >= montantNet ? "EN_ATTENTE" : "PARTIEL",
      montantRestant: String(montantRestantRestaure),
    })
    .where(eq(livraisonsTable.id, cheque.livraisonId));
}

export function resolveBeneficiaireCheque(row: {
  beneficiaire: string;
  nomMembre: string | null;
  prenomsMembre: string | null;
  nomFournisseur: string | null;
  prenomsFournisseur: string | null;
}): string {
  const nomMembre = `${row.nomMembre ?? ""} ${row.prenomsMembre ?? ""}`.trim();
  const nomFournisseur = `${row.nomFournisseur ?? ""} ${row.prenomsFournisseur ?? ""}`.trim();
  return nomMembre || nomFournisseur || row.beneficiaire;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function listCheques(cooperativeId: number, statut?: string) {
  const rows = await db
    .select({
      id:               chequesEmisTable.id,
      numeroCheque:     chequesEmisTable.numeroCheque,
      beneficiaire:     chequesEmisTable.beneficiaire,
      montantFcfa:      chequesEmisTable.montantFcfa,
      statut:           chequesEmisTable.statut,
      dateEmission:     chequesEmisTable.dateEmission,
      dateEcheance:     chequesEmisTable.dateEcheance,
      dateEncaissement: chequesEmisTable.dateEncaissement,
      dateRejet:        chequesEmisTable.dateRejet,
      motifRejet:       chequesEmisTable.motifRejet,
      motifAnnulation:  chequesEmisTable.motifAnnulation,
      compteBancaireId: chequesEmisTable.compteBancaireId,
      paiementId:       chequesEmisTable.paiementId,
      membreId:         chequesEmisTable.membreId,
      livraisonId:      chequesEmisTable.livraisonId,
      createdAt:        chequesEmisTable.createdAt,
      nomBanque:        comptesBancairesTable.nom,
      nomMembre:        membresTable.nom,
      prenomsMembre:    membresTable.prenoms,
      nomFournisseur:   fournisseursTable.nom,
      prenomsFournisseur: fournisseursTable.prenoms,
    })
    .from(chequesEmisTable)
    .leftJoin(comptesBancairesTable, eq(chequesEmisTable.compteBancaireId, comptesBancairesTable.id))
    .leftJoin(livraisonsTable, eq(chequesEmisTable.livraisonId, livraisonsTable.id))
    .leftJoin(
      membresTable,
      sql`${membresTable.id} = coalesce(${chequesEmisTable.membreId}, ${livraisonsTable.membreId})`,
    )
    .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
    .where(
      statut
        ? and(
            eq(chequesEmisTable.cooperativeId, cooperativeId),
            inArray(chequesEmisTable.statut, [statut as "emis" | "encaisse" | "rejete" | "annule"]),
          )
        : eq(chequesEmisTable.cooperativeId, cooperativeId),
    )
    .orderBy(
      sql`CASE ${chequesEmisTable.statut}
        WHEN 'emis' THEN 0
        WHEN 'encaisse' THEN 1
        WHEN 'rejete' THEN 2
        WHEN 'annule' THEN 3
        ELSE 4
      END`,
      desc(chequesEmisTable.dateEmission),
      desc(chequesEmisTable.createdAt),
    );

  return rows.map((row) => ({
    ...row,
    beneficiaire: resolveBeneficiaireCheque(row),
  }));
}

export async function getCheque(id: number, cooperativeId: number) {
  const [row] = await db
    .select()
    .from(chequesEmisTable)
    .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function creerCheque(
  cooperativeId: number,
  data: {
    numeroCheque?: string;
    beneficiaire: string;
    montantFcfa: number;
    compteBancaireId?: number;
    dateEmission?: string;
    dateEcheance?: string;
  },
  userId: number,
) {
  const [cheque] = await db
    .insert(chequesEmisTable)
    .values({
      cooperativeId,
      numeroCheque:     data.numeroCheque ?? null,
      beneficiaire:     data.beneficiaire,
      montantFcfa:      data.montantFcfa,
      compteBancaireId: data.compteBancaireId ?? null,
      dateEmission:     data.dateEmission ?? today(),
      dateEcheance:     data.dateEcheance ?? null,
      statut:           "emis",
      createdBy:        userId,
    })
    .returning();
  return cheque!;
}

export async function creerChequeDepuisLivraison(
  cooperativeId: number,
  opts: {
    paiementId: number;
    membreId: number;
    livraisonId: number;
    membreNom: string;
    montantFcfa: number;
    dateEmission: string;
  },
  userId: number,
) {
  const [cheque] = await db
    .insert(chequesEmisTable)
    .values({
      cooperativeId,
      beneficiaire:  opts.membreNom,
      montantFcfa:   opts.montantFcfa,
      paiementId:    opts.paiementId,
      membreId:      opts.membreId,
      livraisonId:   opts.livraisonId,
      dateEmission:  opts.dateEmission,
      statut:        "emis",
      createdBy:     userId,
    })
    .returning();
  return cheque!;
}

// ─── Mise à jour (numéro, compte, échéance) ────────────────────────────────────

export async function mettreAJourCheque(
  id: number,
  cooperativeId: number,
  data: {
    numeroCheque?: string | null;
    compteBancaireId?: number | null;
    dateEcheance?: string | null;
    beneficiaire?: string;
  },
) {
  const existing = await getCheque(id, cooperativeId);
  if (!existing) throw new Error("Chèque introuvable");
  if (existing.statut !== "emis") throw new Error("Seul un chèque émis peut être modifié");

  const [updated] = await db
    .update(chequesEmisTable)
    .set({
      numeroCheque:     data.numeroCheque !== undefined ? data.numeroCheque : existing.numeroCheque,
      compteBancaireId: data.compteBancaireId !== undefined ? data.compteBancaireId : existing.compteBancaireId,
      dateEcheance:     data.dateEcheance !== undefined ? data.dateEcheance : existing.dateEcheance,
      beneficiaire:     data.beneficiaire ?? existing.beneficiaire,
    })
    .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)))
    .returning();
  return updated!;
}

// ─── Encaissement ──────────────────────────────────────────────────────────────

export async function encaisserCheque(
  id: number,
  cooperativeId: number,
  data: { compteBancaireId: number; dateEncaissement?: string },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesEmisTable)
      .where(and(
        eq(chequesEmisTable.id, id),
        eq(chequesEmisTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);

    if (!cheque) throw new Error("Chèque introuvable");
    if (cheque.statut !== "emis") throw new Error("Seul un chèque émis peut être encaissé");

    const dateEnc = data.dateEncaissement ?? today();
    const beneficiaire = cheque.beneficiaire;

    const { mouvement } = await enregistrerMouvement(data.compteBancaireId, cooperativeId, {
      type:           "debit",
      motif:          "paiement_cheque",
      montantFcfa:    cheque.montantFcfa,
      libelle:        `Chèque encaissé — ${beneficiaire}${cheque.numeroCheque ? ` n°${cheque.numeroCheque}` : ""}`,
      reference:      cheque.numeroCheque ?? undefined,
      dateOperation:  dateEnc,
      userId,
    }, tx);

    const [updated] = await tx
      .update(chequesEmisTable)
      .set({
        statut:           "encaisse",
        dateEncaissement: dateEnc,
        compteBancaireId: data.compteBancaireId,
        mouvementBanqueId: mouvement.id,
      })
      .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)))
      .returning();

    if (cheque.paiementId) {
      await tx
        .update(paiementsTable)
        .set({ statut: "effectue", dateValidation: new Date() })
        .where(eq(paiementsTable.id, cheque.paiementId));
    }

    return updated ?? {
      ...cheque,
      statut: "encaisse" as const,
      dateEncaissement: dateEnc,
      compteBancaireId: data.compteBancaireId,
      mouvementBanqueId: mouvement.id,
    };
  });
}

// ─── Rejet ────────────────────────────────────────────────────────────────────

export async function rejeterCheque(
  id: number,
  cooperativeId: number,
  data: { motifRejet: string; dateRejet?: string },
  userId: number,
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesEmisTable)
      .where(and(
        eq(chequesEmisTable.id, id),
        eq(chequesEmisTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);

    if (!cheque) throw new Error("Chèque introuvable");
    if (cheque.statut !== "emis") throw new Error("Seul un chèque émis peut être rejeté");

    const dateRej = data.dateRejet ?? today();
    const [updated] = await tx
      .update(chequesEmisTable)
      .set({
        statut:     "rejete",
        dateRejet:  dateRej,
        motifRejet: data.motifRejet,
      })
      .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)))
      .returning();

    const paiementRetour = await traiterPaiementApresRetourCheque(
      tx,
      cheque,
      cooperativeId,
      `Chèque rejeté : ${data.motifRejet}`,
    );

    await restaurerSoldeLivraisonApresRetourCheque(tx, {
      ...cheque,
      livraisonId: cheque.livraisonId ?? paiementRetour?.livraisonId ?? null,
    });

    return updated ?? { ...cheque, statut: "rejete" as const, dateRejet: dateRej, motifRejet: data.motifRejet };
  });
}

// ─── Annulation ───────────────────────────────────────────────────────────────

export async function annulerCheque(
  id: number,
  cooperativeId: number,
  data: { motifAnnulation: string },
) {
  return db.transaction(async (tx) => {
    const [cheque] = await tx
      .select()
      .from(chequesEmisTable)
      .where(and(
        eq(chequesEmisTable.id, id),
        eq(chequesEmisTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);

    if (!cheque) throw new Error("Chèque introuvable");
    if (cheque.statut !== "emis") throw new Error("Seul un chèque émis peut être annulé");

    const [updated] = await tx
      .update(chequesEmisTable)
      .set({ statut: "annule", motifAnnulation: data.motifAnnulation })
      .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)))
      .returning();

    const paiementRetour = await traiterPaiementApresRetourCheque(
      tx,
      cheque,
      cooperativeId,
      `Chèque annulé : ${data.motifAnnulation}`,
    );

    await restaurerSoldeLivraisonApresRetourCheque(tx, {
      ...cheque,
      livraisonId: cheque.livraisonId ?? paiementRetour?.livraisonId ?? null,
    });

    return updated ?? { ...cheque, statut: "annule" as const, motifAnnulation: data.motifAnnulation };
  });
}
