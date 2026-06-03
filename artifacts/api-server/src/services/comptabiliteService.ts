/**
 * Service de comptabilité OHADA — génération automatique des écritures comptables.
 * Toutes les fonctions sont fire-and-forget : les appeler APRÈS la transaction principale.
 */
import { db, ecrituresComptablesTable, exercicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const COOP_ID = 1;

async function getExercice(date: string): Promise<number> {
  return new Date(date).getFullYear();
}

async function insererEcritures(
  entries: {
    dateEcriture: string;
    libelle: string;
    compteDebit: string;
    compteCredit: string;
    montantFcfa: number;
    source: "livraison" | "vente" | "avance" | "paiement" | "manuel";
    sourceId?: number;
    numeroPiece?: string;
  }[]
) {
  try {
    const exercice = await getExercice(entries[0]?.dateEcriture ?? new Date().toISOString().split("T")[0]!);
    await db.insert(ecrituresComptablesTable).values(
      entries.map((e) => ({
        cooperativeId: COOP_ID,
        dateEcriture: e.dateEcriture,
        numeroPiece: e.numeroPiece ?? null,
        libelle: e.libelle,
        compteDebit: e.compteDebit,
        compteCredit: e.compteCredit,
        montantFcfa: Math.round(e.montantFcfa),
        source: e.source,
        sourceId: e.sourceId ?? null,
        exercice,
      }))
    );
  } catch (err) {
    logger.error({ err, entries }, "Erreur génération écritures comptables");
  }
}

/**
 * Livraison enregistrée :
 * 1) 601 / 401 = montant brut (achat cacao au producteur)
 * 2) 401 / 521 = montant net payé (décaissement banque)
 * 3) 401 / 416 = avance déduite (imputation sur créance)
 */
export async function generateEcrituresLivraison(params: {
  livraisonId: number;
  membreNom: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
}) {
  const { livraisonId, membreNom, montantBrutFcfa, avanceDeduiteFcfa, montantNetFcfa, dateLivraison } = params;
  const piece = `LIV-${livraisonId}`;
  const entries = [];

  // Achat cacao
  if (montantBrutFcfa > 0) {
    entries.push({
      dateEcriture: dateLivraison,
      numeroPiece: piece,
      libelle: `Achat cacao – ${membreNom}`,
      compteDebit: "601",
      compteCredit: "401",
      montantFcfa: montantBrutFcfa,
      source: "livraison" as const,
      sourceId: livraisonId,
    });
  }

  // Paiement net en banque
  if (montantNetFcfa > 0) {
    entries.push({
      dateEcriture: dateLivraison,
      numeroPiece: piece,
      libelle: `Paiement net livraison – ${membreNom}`,
      compteDebit: "401",
      compteCredit: "521",
      montantFcfa: montantNetFcfa,
      source: "livraison" as const,
      sourceId: livraisonId,
    });
  }

  // Imputation avance
  if (avanceDeduiteFcfa > 0) {
    entries.push({
      dateEcriture: dateLivraison,
      numeroPiece: piece,
      libelle: `Déduction avance sur livraison – ${membreNom}`,
      compteDebit: "401",
      compteCredit: "416",
      montantFcfa: avanceDeduiteFcfa,
      source: "livraison" as const,
      sourceId: livraisonId,
    });
  }

  if (entries.length > 0) await insererEcritures(entries);
}

/**
 * Avance octroyée :
 * 416 / 521 = montant octroyé (créance producteur / décaissement banque)
 */
export async function generateEcrituresAvance(params: {
  avanceId: number;
  membreNom: string;
  montantFcfa: number;
  dateOctroi: string;
}) {
  await insererEcritures([
    {
      dateEcriture: params.dateOctroi,
      numeroPiece: `AVA-${params.avanceId}`,
      libelle: `Avance octroyée – ${params.membreNom}`,
      compteDebit: "416",
      compteCredit: "521",
      montantFcfa: params.montantFcfa,
      source: "avance",
      sourceId: params.avanceId,
    },
  ]);
}

/**
 * Vente exportateur :
 * 4111 / 701 = créance exportateur / produit vente cacao
 */
export async function generateEcrituresVente(params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  dateVente: string;
}) {
  await insererEcritures([
    {
      dateEcriture: params.dateVente,
      numeroPiece: `VTE-${params.venteId}`,
      libelle: `Vente cacao – ${params.exportateurNom}`,
      compteDebit: "4111",
      compteCredit: "701",
      montantFcfa: params.montantFcfa,
      source: "vente",
      sourceId: params.venteId,
    },
  ]);
}

/**
 * Encaissement exportateur :
 * 521 / 4111 = encaissement banque / apurement créance
 */
export async function generateEcrituresEncaissement(params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  date: string;
}) {
  await insererEcritures([
    {
      dateEcriture: params.date,
      numeroPiece: `ENC-${params.venteId}`,
      libelle: `Encaissement exportateur – ${params.exportateurNom}`,
      compteDebit: "521",
      compteCredit: "4111",
      montantFcfa: params.montantFcfa,
      source: "paiement",
      sourceId: params.venteId,
    },
  ]);
}
