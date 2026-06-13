/**
 * check-schema-coverage.ts
 *
 * Vérifie que chaque table définie dans lib/db/src/schema/
 * est couverte par au moins un CREATE TABLE dans lib/db/drizzle/*.sql
 *
 * Quitte avec code 1 si des tables manquent → fait échouer la CI.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_DIR = join(ROOT, "lib/db/src/schema");
const MIGRATIONS_DIR = join(ROOT, "lib/db/drizzle");

// ─── 1. Tables définies dans le schéma Drizzle ────────────────────────────────

function extractSchemaTableNames(): Set<string> {
  const tables = new Set<string>();
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const content = readFileSync(join(SCHEMA_DIR, file), "utf8");
    // Matches: pgTable("table_name", ...)
    const matches = content.matchAll(/pgTable\(\s*["']([^"']+)["']/g);
    for (const m of matches) {
      tables.add(m[1]);
    }
  }

  return tables;
}

// ─── 2. Tables couvertes par les migrations SQL ───────────────────────────────

function extractMigrationTableNames(): Set<string> {
  const tables = new Set<string>();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Matches: CREATE TABLE "name" or CREATE TABLE IF NOT EXISTS "name" or name
    const matches = content.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi
    );
    for (const m of matches) {
      tables.add(m[1].toLowerCase());
    }
  }

  return tables;
}

// ─── 3. Comparaison ───────────────────────────────────────────────────────────

const schemaTableNames = extractSchemaTableNames();
const migrationTableNames = extractMigrationTableNames();

const missing: string[] = [];
for (const table of schemaTableNames) {
  if (!migrationTableNames.has(table)) {
    missing.push(table);
  }
}

// ─── 4. Rapport ───────────────────────────────────────────────────────────────

console.log(`\nVérification de la couverture des migrations`);
console.log(`─────────────────────────────────────────────`);
console.log(`Tables dans le schéma  : ${schemaTableNames.size}`);
console.log(`Tables dans migrations : ${migrationTableNames.size}`);

if (missing.length === 0) {
  console.log(`\n✅  Toutes les tables sont couvertes par une migration SQL.\n`);
  process.exit(0);
} else {
  console.error(`\n❌  ${missing.length} table(s) manquent dans les migrations SQL :`);
  for (const t of missing.sort()) {
    console.error(`     - ${t}`);
  }
  console.error(
    `\n💡  Créez lib/db/drizzle/00XX_<nom>.sql avec CREATE TABLE IF NOT EXISTS pour chacune,`
  );
  console.error(`    puis ajoutez l'entrée correspondante dans lib/db/drizzle/meta/_journal.json.\n`);
  process.exit(1);
}
