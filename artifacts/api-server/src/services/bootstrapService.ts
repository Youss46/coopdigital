import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Insère les données de référence par défaut pour chaque coopérative
 * qui n'en possède pas encore. Idempotent — sans risque si appelé plusieurs fois.
 */
export async function bootstrapReferenceData(): Promise<void> {
  await bootstrapCategoriesIntrants();
}

async function bootstrapCategoriesIntrants(): Promise<void> {
  try {
    const result = await db.execute<{ inserted: number }>(sql`
      INSERT INTO categories_intrants (cooperative_id, libelle, unite)
      SELECT c.id, v.libelle, v.unite
      FROM cooperatives c
      CROSS JOIN (VALUES
        ('Engrais',           'kg'),
        ('Pesticides',        'litre'),
        ('Fongicides',        'litre'),
        ('Herbicides',        'litre'),
        ('Semences',          'kg'),
        ('Équipements EPI',   'unité'),
        ('Matériel agricole', 'unité')
      ) AS v(libelle, unite)
      WHERE NOT EXISTS (
        SELECT 1 FROM categories_intrants ci
        WHERE ci.cooperative_id = c.id
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const inserted = result.rows.length;
    if (inserted > 0) {
      logger.info({ inserted }, "Bootstrap: catégories intrants insérées");
    }
  } catch (err) {
    logger.error({ err }, "Bootstrap: erreur catégories intrants — ignoré");
  }
}
