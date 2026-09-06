/**
 * fresh-migrate.ts — Application complète des migrations sur une DB vierge
 *
 * Contrairement à ci-migrate.ts (qui baseline à 0023 pour Railway),
 * ce script applique TOUTES les migrations depuis 0000, sans baseline.
 * À utiliser sur une base de données fraîche (ex: Replit DB).
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

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // Créer le schéma de tracking Drizzle si absent
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);
  console.log("✅ Schéma de tracking Drizzle initialisé");

  // Appliquer TOUTES les migrations (sans baseline — DB fraîche)
  console.log(`📂 Dossier migrations : ${migrationsFolder}`);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log("✅ Toutes les migrations présentes appliquées avec succès");

} catch (err) {
  console.error("❌ Erreur lors des migrations :", err);
  process.exit(1);
} finally {
  await client.end();
}
