/**
 * ci-migrate.ts — Script de migration CI/CD
 *
 * Utilisé par le GitHub Action à la place de `drizzle-kit migrate`.
 * Combine en une seule passe :
 *  1. Initialisation du tracking Drizzle (si DB créée via push sans tracking)
 *  2. Application des migrations SQL en attente via drizzle-orm/migrator
 *
 * Avantage : utilise la même API que runMigrations() côté serveur,
 * sans dépendre de drizzle-kit ni d'aucun prompt interactif.
 */

import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL est requis");
  process.exit(1);
}

// Chemin vers le dossier des migrations SQL (lib/db/drizzle/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../drizzle");

// when de la migration 0018 — dernière appliquée lors du setup initial avec push
const BASELINE_CREATED_AT = 1749990000000n;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ── Étape 1 : initialiser le tracking Drizzle si absent ──────────────────
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const { rows } = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations"
  );
  const count = parseInt(rows[0].count, 10);

  if (count === 0) {
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["baseline-0018-initial-push-setup", BASELINE_CREATED_AT]
    );
    console.log(`✅ Baseline initialisée : migrations 0000-0018 marquées appliquées`);
  } else {
    const { rows: last } = await client.query<{ created_at: string }>(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1"
    );
    console.log(`ℹ️  Tracking déjà présent (${count} migrations, dernier created_at=${last[0]?.created_at})`);
  }

  // ── Étape 2 : appliquer les migrations en attente ────────────────────────
  console.log(`📂 Dossier migrations : ${migrationsFolder}`);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log("✅ Migrations appliquées avec succès");
} finally {
  await client.end();
}
