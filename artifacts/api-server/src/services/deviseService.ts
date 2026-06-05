import { db } from "@workspace/db";
import { tauxChangeTable } from "@workspace/db";
import { eq, and, lte, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const COOP_ID = 1;

/**
 * Retourne le taux le plus récent pour une devise source.
 * Lève une alerte si aucun taux dans les 7 derniers jours.
 */
export async function getTauxActuel(deviseSource: string): Promise<{
  taux: number;
  dateApplication: string;
  sourceTaux: string;
  alerteAncien: boolean;
}> {
  const [row] = await db
    .select()
    .from(tauxChangeTable)
    .where(
      and(
        eq(tauxChangeTable.cooperativeId, COOP_ID),
        eq(tauxChangeTable.deviseSource, deviseSource),
      )
    )
    .orderBy(desc(tauxChangeTable.dateApplication))
    .limit(1);

  if (!row) {
    throw new Error(`Aucun taux disponible pour la devise ${deviseSource}`);
  }

  const ageLimitDate = new Date();
  ageLimitDate.setDate(ageLimitDate.getDate() - 7);
  const alerteAncien = new Date(row.dateApplication) < ageLimitDate;

  if (alerteAncien) {
    logger.warn({ deviseSource, dateApplication: row.dateApplication }, "Taux de change ancien (> 7 jours)");
  }

  return {
    taux: Number(row.taux),
    dateApplication: row.dateApplication,
    sourceTaux: row.sourceTaux,
    alerteAncien,
  };
}

/**
 * Convertit un montant en devise étrangère vers XOF.
 * Utilise le taux du jour ou le plus proche avant la date donnée.
 */
export async function convertir(
  montant: number,
  deviseSource: string,
  date: string,
): Promise<{ montantFcfa: number; tauxApplique: number; dateApplication: string; sourceTaux: string }> {
  if (deviseSource === "XOF") {
    return { montantFcfa: montant, tauxApplique: 1, dateApplication: date, sourceTaux: "XOF" };
  }

  const [row] = await db
    .select()
    .from(tauxChangeTable)
    .where(
      and(
        eq(tauxChangeTable.cooperativeId, COOP_ID),
        eq(tauxChangeTable.deviseSource, deviseSource),
        lte(tauxChangeTable.dateApplication, date),
      )
    )
    .orderBy(desc(tauxChangeTable.dateApplication))
    .limit(1);

  if (!row) {
    // Fallback : prendre le dernier taux disponible
    const [fallback] = await db
      .select()
      .from(tauxChangeTable)
      .where(
        and(
          eq(tauxChangeTable.cooperativeId, COOP_ID),
          eq(tauxChangeTable.deviseSource, deviseSource),
        )
      )
      .orderBy(desc(tauxChangeTable.dateApplication))
      .limit(1);

    if (!fallback) {
      throw new Error(`Aucun taux disponible pour ${deviseSource}`);
    }
    const taux = Number(fallback.taux);
    return {
      montantFcfa: Math.round(montant * taux),
      tauxApplique: taux,
      dateApplication: fallback.dateApplication,
      sourceTaux: fallback.sourceTaux,
    };
  }

  const taux = Number(row.taux);
  return {
    montantFcfa: Math.round(montant * taux),
    tauxApplique: taux,
    dateApplication: row.dateApplication,
    sourceTaux: row.sourceTaux,
  };
}
