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
    // Migration 0045 : nombre_sacs sur expeditions (idempotent)
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS nombre_sacs integer`,
    // Migration 0046 : colonnes de liaison comptable sur expeditions (idempotent)
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_depart_id    integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_arrivee_id   integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_transport_id integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_ecart_id     integer`,
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
 * Baseline timestamp : when de la migration 0023 — dernière migration appliquée
 * via `drizzle-kit push` sur Railway lors de la mise en place initiale.
 * Toutes les migrations dont le timestamp ≤ cette valeur sont déjà présentes
 * en DB et ne doivent pas être ré-exécutées.
 *
 * Sans cette baseline, le migrator essaie de ré-appliquer 0000-0023
 * (tables déjà existantes), échoue, et les migrations 0024+ ne sont jamais
 * appliquées → colonnes manquantes en production.
 */
const BASELINE_CREATED_AT = 1781348700000n;

/**
 * S'assure que la table de tracking Drizzle existe et que le curseur baseline
 * est positionné correctement pour éviter de re-exécuter les migrations déjà
 * présentes via push.
 */
async function ensureBaseline(client: pg.Client): Promise<void> {
  // Créer le schéma et la table de tracking si absents
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Lire le curseur actuel
  const { rows } = await client.query<{ last_ts: string | null }>(
    `SELECT MAX(created_at)::text AS last_ts FROM drizzle.__drizzle_migrations`
  );
  const lastTs = rows[0]?.last_ts ? BigInt(rows[0].last_ts) : 0n;

  if (lastTs < BASELINE_CREATED_AT) {
    // Positionner le curseur sur 0023 pour sauter toutes les migrations push
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["baseline-up-to-0023-push-setup", BASELINE_CREATED_AT]
    );
    console.log(
      `[migrate] Baseline insérée : migrations 0000-0023 marquées comme appliquées (lastTs=${lastTs} → ${BASELINE_CREATED_AT})`
    );
  } else {
    console.log(`[migrate] Curseur déjà à jour (last_ts=${lastTs})`);
  }
}

/**
 * Applique toutes les migrations SQL en attente depuis `migrationsFolder`.
 * Idempotent : chaque migration n'est exécutée qu'une seule fois
 * (suivi dans la table `drizzle.__drizzle_migrations`).
 *
 * Intègre la logique de baseline pour les DB initialisées via push
 * (Railway, Replit) où les tables 0000-0023 existent déjà sans entrée
 * dans la table de tracking.
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
    await ensureBaseline(client);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] ✅ Toutes les migrations appliquées avec succès");
  } finally {
    await client.end();
  }
}
