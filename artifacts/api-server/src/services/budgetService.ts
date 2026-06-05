import { db } from "@workspace/db";
import {
  budgetsCampagneTable, lignesBudgetTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Agrège les données réelles de la campagne et met à jour
 * montant_realise_fcfa + ecart_pct sur chaque ligne du budget.
 */
export async function syncRealise(budgetId: number): Promise<void> {
  // Récupère le budget pour avoir la campagne
  const [budget] = await db
    .select()
    .from(budgetsCampagneTable)
    .where(eq(budgetsCampagneTable.id, budgetId))
    .limit(1);

  if (!budget) {
    throw new Error(`Budget ${budgetId} introuvable`);
  }

  const campagneId   = budget.campagneId;
  const coopId       = budget.cooperativeId;

  // ── Recettes : somme encaissée sur ventes exportateurs de la campagne
  const recettes = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(montant_recu_fcfa), 0)::text AS total
    FROM ventes_exportateurs ve
    JOIN exportateurs e ON e.id = ve.exportateur_id
    WHERE ve.campagne_id = ${campagneId}
      AND e.cooperative_id = ${coopId}
  `);

  // ── Charges achat : somme montant_net_fcfa des livraisons de la campagne
  const achats = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(l.montant_net_fcfa), 0)::text AS total
    FROM livraisons l
    JOIN membres m ON m.id = l.membre_id
    WHERE l.campagne_id = ${campagneId}
      AND m.cooperative_id = ${coopId}
  `);

  // ── Charges personnel : salaires bruts des bulletins validés
  const personnel = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(bp.salaire_brut_fcfa), 0)::text AS total
    FROM bulletins_paie bp
    JOIN personnel p ON p.id = bp.personnel_id
    WHERE p.cooperative_id = ${coopId}
      AND bp.statut IN ('valide', 'paye')
  `);

  // ── Charges financières : intérêts remboursés sur les emprunts de la coop
  const financier = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(re.montant_interet_fcfa), 0)::text AS total
    FROM remboursements_emprunts re
    JOIN emprunts emp ON emp.id = re.emprunt_id
    WHERE emp.cooperative_id = ${coopId}
  `);

  const totalRecette   = parseFloat(recettes.rows[0]?.["total"]  ?? "0");
  const totalAchat     = parseFloat(achats.rows[0]?.["total"]    ?? "0");
  const totalPersonnel = parseFloat(personnel.rows[0]?.["total"] ?? "0");
  const totalFinancier = parseFloat(financier.rows[0]?.["total"] ?? "0");

  // Distribue le réalisé sur les lignes selon la catégorie
  const lignes = await db
    .select()
    .from(lignesBudgetTable)
    .where(eq(lignesBudgetTable.budgetId, budgetId));

  for (const ligne of lignes) {
    let realise: number | null = null;

    switch (ligne.categorie) {
      case "recette":             realise = totalRecette;   break;
      case "charge_achat":        realise = totalAchat;     break;
      case "charge_personnel":    realise = totalPersonnel; break;
      case "charge_financiere":   realise = totalFinancier; break;
      default: continue; // charge_exploitation / investissement → saisie manuelle
    }

    const previsionnel = parseFloat(ligne.montantPrevisionnelFcfa ?? "0");
    const ecartPct = previsionnel !== 0
      ? ((realise - previsionnel) / previsionnel) * 100
      : 0;

    await db
      .update(lignesBudgetTable)
      .set({
        montantRealiseFcfa: String(realise),
        ecartPct:           String(ecartPct.toFixed(4)),
      })
      .where(eq(lignesBudgetTable.id, ligne.id));
  }

  // Mise à jour updated_at du budget
  await db
    .update(budgetsCampagneTable)
    .set({ updatedAt: new Date() })
    .where(eq(budgetsCampagneTable.id, budgetId));

  logger.info({ budgetId }, "syncRealise budget terminé");
}

/**
 * Retourne les lignes en dépassement > 10% du prévisionnel.
 */
export async function getAlertesDepassement(budgetId: number) {
  const lignes = await db
    .select()
    .from(lignesBudgetTable)
    .where(
      and(
        eq(lignesBudgetTable.budgetId, budgetId),
        sql`montant_previsionnel_fcfa > 0`,
      )
    );

  return lignes.filter((l) => {
    const realise = parseFloat(l.montantRealiseFcfa ?? "0");
    const prev    = parseFloat(l.montantPrevisionnelFcfa ?? "0");
    return prev > 0 && realise > prev * 1.10;
  });
}

/**
 * Sync toutes les nuits : applique syncRealise sur tous les budgets non clôturés.
 */
export async function syncTousLesBudgets(): Promise<void> {
  const budgets = await db
    .select({ id: budgetsCampagneTable.id })
    .from(budgetsCampagneTable)
    .where(
      and(
        sql`${budgetsCampagneTable.statut} != 'cloture'`,
      )
    );

  for (const b of budgets) {
    try {
      await syncRealise(b.id);
    } catch (err) {
      logger.error({ err, budgetId: b.id }, "Erreur syncRealise CRON");
    }
  }
  logger.info({ count: budgets.length }, "CRON syncBudget terminé");
}
