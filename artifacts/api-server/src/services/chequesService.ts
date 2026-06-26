import {
  db,
  chequesEmisTable,
  comptesBancairesTable,
  paiementsTable,
  livraisonsTable,
  membresTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { enregistrerMouvement } from "./banqueService.js";

function today(): string { return new Date().toISOString().slice(0, 10); }

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
    })
    .from(chequesEmisTable)
    .leftJoin(comptesBancairesTable, eq(chequesEmisTable.compteBancaireId, comptesBancairesTable.id))
    .leftJoin(membresTable, eq(chequesEmisTable.membreId, membresTable.id))
    .where(
      statut
        ? and(
            eq(chequesEmisTable.cooperativeId, cooperativeId),
            inArray(chequesEmisTable.statut, [statut as "emis" | "encaisse" | "rejete" | "annule"]),
          )
        : eq(chequesEmisTable.cooperativeId, cooperativeId),
    )
    .orderBy(desc(chequesEmisTable.dateEmission));

  return rows;
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
  const cheque = await getCheque(id, cooperativeId);
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
  });

  await db
    .update(chequesEmisTable)
    .set({
      statut:           "encaisse",
      dateEncaissement: dateEnc,
      compteBancaireId: data.compteBancaireId,
      mouvementBanqueId: mouvement.id,
    })
    .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)));

  if (cheque.paiementId) {
    await db
      .update(paiementsTable)
      .set({ statut: "effectue", dateValidation: new Date() })
      .where(eq(paiementsTable.id, cheque.paiementId));
  }

  return { ...cheque, statut: "encaisse" as const, dateEncaissement: dateEnc };
}

// ─── Rejet ────────────────────────────────────────────────────────────────────

export async function rejeterCheque(
  id: number,
  cooperativeId: number,
  data: { motifRejet: string; dateRejet?: string },
  userId: number,
) {
  const cheque = await getCheque(id, cooperativeId);
  if (!cheque) throw new Error("Chèque introuvable");
  if (cheque.statut !== "emis") throw new Error("Seul un chèque émis peut être rejeté");

  const dateRej = data.dateRejet ?? today();

  await db
    .update(chequesEmisTable)
    .set({
      statut:     "rejete",
      dateRejet:  dateRej,
      motifRejet: data.motifRejet,
    })
    .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)));

  if (cheque.paiementId) {
    await db
      .update(paiementsTable)
      .set({ statut: "rejete", motifRejet: data.motifRejet, validePar: userId })
      .where(eq(paiementsTable.id, cheque.paiementId));
  }

  if (cheque.livraisonId) {
    await db
      .update(livraisonsTable)
      .set({ statutPaiement: "EN_ATTENTE" })
      .where(eq(livraisonsTable.id, cheque.livraisonId));
  }

  return { ...cheque, statut: "rejete" as const, motifRejet: data.motifRejet };
}

// ─── Annulation ───────────────────────────────────────────────────────────────

export async function annulerCheque(
  id: number,
  cooperativeId: number,
  data: { motifAnnulation: string },
) {
  const cheque = await getCheque(id, cooperativeId);
  if (!cheque) throw new Error("Chèque introuvable");
  if (cheque.statut !== "emis") throw new Error("Seul un chèque émis peut être annulé");

  await db
    .update(chequesEmisTable)
    .set({ statut: "annule", motifAnnulation: data.motifAnnulation })
    .where(and(eq(chequesEmisTable.id, id), eq(chequesEmisTable.cooperativeId, cooperativeId)));

  return { ...cheque, statut: "annule" as const };
}
