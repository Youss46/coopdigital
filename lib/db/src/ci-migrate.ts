/**
 * ci-migrate.ts — Script de migration CI/CD
 *
 * Combine en une seule passe sans drizzle-kit, sans prompt interactif :
 *  1. Initialisation du tracking Drizzle si absent
 *  2. Remontée du curseur baseline si la DB a été partiellement migrée via push
 *  3. Application des migrations SQL en attente via drizzle-orm/migrator
 *
 * Logique de saut Drizzle :
 *   Une migration est skippée si  lastRecord.created_at >= migration.folderMillis
 *   (ORDER BY created_at DESC LIMIT 1 sur drizzle.__drizzle_migrations)
 *
 * On insère un enregistrement avec created_at = when(0023) = 1781348700000
 * afin que toutes les migrations 0000-0023 soient skippées et que seule
 * la 0024 (et les suivantes) soit appliquée.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../drizzle");

// when de la migration 0023 — la dernière appliquée via push sur Railway
// (toutes les migrations 0000-0023 existent déjà en DB via drizzle-kit push)
// Valeur = journal entry 0023.when = 1781348700000
const BASELINE_CREATED_AT = 1781348700000n;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ── Étape 1 : créer le schéma et la table de tracking si absents ─────────
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // ── Étape 2 : vérifier le curseur actuel ─────────────────────────────────
  const { rows } = await client.query<{ count: string; last_ts: string | null }>(
    `SELECT COUNT(*)::text AS count,
            MAX(created_at)::text AS last_ts
     FROM drizzle.__drizzle_migrations`
  );
  const count = parseInt(rows[0].count, 10);
  const lastTs = rows[0].last_ts ? BigInt(rows[0].last_ts) : 0n;

  if (lastTs < BASELINE_CREATED_AT) {
    // Insérer un enregistrement pour monter le curseur à 0023
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["baseline-up-to-0023-push-setup", BASELINE_CREATED_AT]
    );
    console.log(
      `✅ Baseline insérée : migrations 0000-0023 marquées appliquées` +
      ` (lastTs=${lastTs} → ${BASELINE_CREATED_AT})`
    );
  } else {
    console.log(
      `ℹ️  Curseur déjà à jour (${count} enregistrement(s), last_ts=${lastTs})`
    );
  }

  // ── Étape 3 : appliquer les migrations en attente ─────────────────────────
  console.log(`📂 Dossier migrations : ${migrationsFolder}`);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log("✅ Migrations appliquées avec succès");
} finally {
  await client.end();
}
