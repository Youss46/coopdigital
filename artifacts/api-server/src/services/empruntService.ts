import { db } from "@workspace/db";
import {
  empruntsTable,
  echeancierEmpruntsTable,
  echeanceStatutEnum,
} from "@workspace/db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface LigneEcheancier {
  empruntId: number;
  numeroEcheance: number;
  dateEcheance: string;
  capitalFcfa: string;
  interetFcfa: string;
  totalEcheanceFcfa: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Ajoute N mois à une date ISO (YYYY-MM-DD) */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Ajoute N mois selon la périodicité */
function pasEnMois(periodicite: string): number {
  switch (periodicite) {
    case "mensuel":      return 1;
    case "trimestriel":  return 3;
    case "semestriel":   return 6;
    case "annuel":       return 12;
    case "in_fine":      return 0; // traité séparément
    default:             return 1;
  }
}

/**
 * Génère toutes les lignes de l'échéancier pour un emprunt.
 * Méthode : amortissement constant (capital fixe par période).
 * Formule intérêt : solde_restant × taux_mensuel × pas_en_mois
 */
export function computeEcheancier(params: {
  empruntId: number;
  montantFcfa: number;
  tauxInteretAnnuelPct: number;
  dureeMois: number;
  dateDebut: string;
  periodicite: string;
}): LigneEcheancier[] {
  const { empruntId, montantFcfa, tauxInteretAnnuelPct, dureeMois, dateDebut, periodicite } = params;
  const tauxMensuel = tauxInteretAnnuelPct / 100 / 12;
  const lignes: LigneEcheancier[] = [];

  if (periodicite === "in_fine") {
    // Remboursement du capital en une seule fois, intérêts chaque mois
    for (let m = 1; m <= dureeMois; m++) {
      const dateEch = addMonths(dateDebut, m);
      const interet = Math.round(montantFcfa * tauxMensuel);
      const capital = m === dureeMois ? montantFcfa : 0;
      lignes.push({
        empruntId,
        numeroEcheance: m,
        dateEcheance: dateEch,
        capitalFcfa:       String(capital),
        interetFcfa:       String(interet),
        totalEcheanceFcfa: String(capital + interet),
      });
    }
    return lignes;
  }

  const pas = pasEnMois(periodicite);
  const nbEcheances = Math.ceil(dureeMois / pas);
  const capitalParEch = Math.round(montantFcfa / nbEcheances);
  let solde = montantFcfa;

  for (let i = 1; i <= nbEcheances; i++) {
    const dateEch = addMonths(dateDebut, i * pas);
    const interet = Math.round(solde * tauxMensuel * pas);
    const capital = i === nbEcheances
      ? solde  // ajustement arrondi final
      : capitalParEch;
    solde -= capital;
    lignes.push({
      empruntId,
      numeroEcheance: i,
      dateEcheance: dateEch,
      capitalFcfa:       String(capital),
      interetFcfa:       String(interet),
      totalEcheanceFcfa: String(capital + interet),
    });
  }
  return lignes;
}

/**
 * Insère toutes les lignes de l'échéancier en base.
 */
export async function generateEcheancier(params: {
  empruntId: number;
  montantFcfa: number;
  tauxInteretAnnuelPct: number;
  dureeMois: number;
  dateDebut: string;
  periodicite: string;
}): Promise<void> {
  const lignes = computeEcheancier(params);
  if (lignes.length === 0) return;
  await db.insert(echeancierEmpruntsTable).values(lignes);
}

/**
 * CRON quotidien : passe en statut 'en_retard' les échéances dépassées.
 */
export async function checkEcheancesEnRetard(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const result = await db
      .update(echeancierEmpruntsTable)
      .set({ statut: "en_retard" })
      .where(
        and(
          eq(echeancierEmpruntsTable.statut, "a_payer"),
          lte(echeancierEmpruntsTable.dateEcheance, today),
        )
      )
      .returning({ id: echeancierEmpruntsTable.id, empruntId: echeancierEmpruntsTable.empruntId });

    if (result.length > 0) {
      // Mettre à jour le statut de l'emprunt si des échéances sont en retard
      const empruntIds = [...new Set(result.map(r => r.empruntId))];
      await db
        .update(empruntsTable)
        .set({ statut: "en_retard", updatedAt: new Date() })
        .where(
          and(
            inArray(empruntsTable.id, empruntIds),
            eq(empruntsTable.statut, "en_cours"),
          )
        );

      logger.info({ count: result.length }, "Échéances passées en retard");
    }
  } catch (err) {
    logger.error({ err }, "Erreur checkEcheancesEnRetard");
  }
}
