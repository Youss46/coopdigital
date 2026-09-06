import { readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "pg";

type SchemaObjectKind = "table" | "column";

type SchemaObject = {
  kind: SchemaObjectKind;
  schema?: string;
  table: string;
  name?: string;
};

type MigrationSchemaCheck = {
  migration: string;
  objects: SchemaObject[];
};

type SchemaCheckManifest = {
  enforceFromMigration: string;
  checks: MigrationSchemaCheck[];
};

type Journal = {
  entries: Array<{ tag: string }>;
};

const DB_ROOT = path.resolve(import.meta.dirname, "..");
const JOURNAL_PATH = path.join(DB_ROOT, "drizzle/meta/_journal.json");
const CHECKS_PATH = path.join(DB_ROOT, "drizzle/meta/schema-checks.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}
export function loadSchemaCheckManifest(): SchemaCheckManifest {
  return readJson<SchemaCheckManifest>(CHECKS_PATH);
}

/**
 * Ensures every migration from the enforcement boundary has a declared
 * contract. This makes adding a migration without a post-migration check a CI
 * failure instead of a silent gap.
 */
export function validateSchemaCheckManifest(
  manifest = loadSchemaCheckManifest(),
  journal = readJson<Journal>(JOURNAL_PATH),
): void {
  const startIndex = journal.entries.findIndex(
    (entry) => entry.tag === manifest.enforceFromMigration,
  );
  if (startIndex === -1) {
    throw new Error(
      `Migration de départ des contrôles introuvable dans _journal.json : ${manifest.enforceFromMigration}`,
    );
  }

  const declared = new Map<string, MigrationSchemaCheck>();
  for (const check of manifest.checks) {
    if (declared.has(check.migration)) {
      throw new Error(
        `Contrat de schéma déclaré plusieurs fois pour la migration ${check.migration}`,
      );
    }
    if (check.objects.length === 0) {
      throw new Error(
        `Le contrat de schéma de ${check.migration} doit déclarer au moins un objet`,
      );
    }
    declared.set(check.migration, check);
  }

  const journalTags = new Set(journal.entries.map((entry) => entry.tag));
  for (const check of manifest.checks) {
    if (!journalTags.has(check.migration)) {
      throw new Error(
        `Contrat de schéma inconnu : ${check.migration} n'est pas dans _journal.json`,
      );
    }
  }

  const missing = journal.entries
    .slice(startIndex)
    .map((entry) => entry.tag)
    .filter((tag) => !declared.has(tag));
  if (missing.length > 0) {
    throw new Error(
      `Contrat de schéma manquant pour la/les migration(s) : ${missing.join(", ")}. ` +
        `Ajoutez chaque migration à ${path.basename(CHECKS_PATH)} avant le déploiement.`,
    );
  }
}

async function schemaObjectExists(
  client: Pick<Client, "query">,
  object: SchemaObject,
): Promise<boolean> {
  const schema = object.schema ?? "public";
  if (object.kind === "table") {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = $2
       ) AS exists`,
      [schema, object.table],
    );
    return result.rows[0]?.exists === true;
  }

  if (!object.name) {
    throw new Error(
      `Objet de schéma invalide : la colonne ${schema}.${object.table} doit avoir un nom`,
    );
  }

  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = $2
         AND column_name = $3
     ) AS exists`,
    [schema, object.table, object.name],
  );
  return result.rows[0]?.exists === true;
}

export async function verifySchemaObjects(
  client: Pick<Client, "query">,
  manifest = loadSchemaCheckManifest(),
): Promise<void> {
  validateSchemaCheckManifest(manifest);

  const missing: string[] = [];
  for (const check of manifest.checks) {
    for (const object of check.objects) {
      const schema = object.schema ?? "public";
      const label =
        object.kind === "table"
          ? `table ${schema}.${object.table}`
          : `column ${schema}.${object.table}.${object.name}`;
      if (!(await schemaObjectExists(client, object))) {
        missing.push(`${check.migration} → ${label}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Objets de schéma absents après les migrations :\n` +
        missing.map((item) => `  - ${item}`).join("\n"),
    );
  }

  const count = manifest.checks.reduce(
    (total, check) => total + check.objects.length,
    0,
  );
  console.log(
    `✅ Contrôle de schéma réussi : ${count} objet(s) critique(s) présent(s)`,
  );
}