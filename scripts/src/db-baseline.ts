/**
 * db-baseline.ts
 *
 * Initialise le tracking Drizzle sur une DB qui a été créée avec `drizzle-kit push`
 * (sans table de suivi des migrations). Marque les migrations 0000-0018 comme déjà
 * appliquées en insérant un seul enregistrement avec created_at = when(0018).
 *
 * Drizzle utilise ORDER BY created_at DESC LIMIT 1 pour savoir quelle est la dernière
 * migration appliquée. Toute migration dont folderMillis <= created_at est skippée.
 *
 * Résultat : drizzle-kit migrate n'applique que 0019 et au-delà.
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL est requis");
  process.exit(1);
}

// when de la migration 0018 (type_caisse) — dernière migration du setup initial
const BASELINE_CREATED_AT = 1749990000000n;

const client = new pg.Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  // 1. Créer le schéma drizzle
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");

  // 2. Créer la table de tracking si absente
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // 3. Vérifier si des enregistrements existent déjà
  const { rows } = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations"
  );
  const count = parseInt(rows[0].count, 10);

  if (count === 0) {
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["baseline-0018-initial-push-setup", BASELINE_CREATED_AT]
    );
    console.log(
      `✅ Baseline insérée : migrations 0000-0018 marquées comme appliquées (created_at=${BASELINE_CREATED_AT})`
    );
  } else {
    const { rows: last } = await client.query<{ created_at: string }>(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1"
    );
    console.log(
      `ℹ️  Table déjà initialisée (${count} enregistrement(s), dernier created_at=${last[0]?.created_at}). Aucune action.`
    );
  }
} finally {
  await client.end();
}
