import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Patch de rattrapage : applique des colonnes manquantes de façon idempotente,
 * avant que le runner Drizzle tente ses migrations.
 */
async function applyHotfixes(client: pg.Client): Promise<void> {
  const hotfixes = [
    `ALTER TABLE entrepots_delegues ADD COLUMN IF NOT EXISTS capacite_sacs integer`,
    `ALTER TABLE entrepots ADD COLUMN IF NOT EXISTS capacite_sacs integer`,
    `ALTER TABLE mouvements_stock ADD COLUMN IF NOT EXISTS nombre_sacs integer`,
    `ALTER TABLE config_paie ADD COLUMN IF NOT EXISTS smig_fcfa integer NOT NULL DEFAULT 75000`,
    // Paiement salaires : débit automatique des comptes de trésorerie
    `ALTER TYPE mode_paiement_personnel ADD VALUE IF NOT EXISTS 'banque'`,
    `ALTER TABLE mouvements_caisse ALTER COLUMN session_id DROP NOT NULL`,
    `ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS compte_source_type text`,
    `ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS compte_source_id integer`,
  ];

  for (const sql of hotfixes) {
    try {
      await client.query(sql);
    } catch (_) {
      // table n'existe pas encore — ignoré, les migrations créeront la table avec la colonne
    }
  }
}

/**
 * Applique toutes les migrations SQL en attente depuis `migrationsFolder`.
 * Idempotent : chaque migration n'est exécutée qu'une seule fois
 * (suivi dans la table `__drizzle_migrations`).
 *
 * @param migrationsFolder - Chemin absolu vers le dossier contenant les fichiers SQL.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL est requis pour appliquer les migrations");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await applyHotfixes(client);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
