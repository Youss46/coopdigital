import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { loadSchemaCheckManifest, verifySchemaObjects } from "@workspace/db";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll(`"`, `""`)}"`;
}

function qualifiedIdentifier(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

describe.skipIf(!enabled)("contrôles du schéma PostgreSQL", () => {
  type SchemaCheckClient = Parameters<typeof verifySchemaObjects>[0] & {
    release: () => void;
  };
  let client!: SchemaCheckClient;
  let schemaName: string;
  let manifest: ReturnType<typeof loadSchemaCheckManifest>;

  beforeAll(async () => {
    client = await pool.connect();
    schemaName = `schema_check_${process.pid}_${Date.now()}`;
    manifest = loadSchemaCheckManifest();

    await client.query(
      `CREATE SCHEMA ${quoteIdentifier(schemaName)};

       CREATE TABLE ${qualifiedIdentifier(schemaName, "sessions_pesee")} (
         id integer NOT NULL
       );
       CREATE UNIQUE INDEX ${quoteIdentifier("sessions_pesee_unique_en_cours")}
         ON ${qualifiedIdentifier(schemaName, "sessions_pesee")} (id);
       CREATE UNIQUE INDEX ${quoteIdentifier("sessions_pesee_bon_reception_unique")}
         ON ${qualifiedIdentifier(schemaName, "sessions_pesee")} (id);

       CREATE TABLE ${qualifiedIdentifier(schemaName, "paiements")} (
         id integer NOT NULL,
         cooperative_id integer NOT NULL,
         numero_recu text,
         date_validation date,
         statut text NOT NULL
       );
       ALTER TABLE ${qualifiedIdentifier(schemaName, "paiements")}
         ADD CONSTRAINT ${quoteIdentifier("paiements_confirmes_date_validation_check")}
         CHECK (true);
       ALTER TABLE ${qualifiedIdentifier(schemaName, "paiements")}
         ADD CONSTRAINT ${quoteIdentifier("paiements_cooperative_numero_recu_unique")}
         UNIQUE (cooperative_id, numero_recu);
       ALTER TABLE ${qualifiedIdentifier(schemaName, "paiements")}
         ADD CONSTRAINT ${quoteIdentifier("paiements_cooperative_numero_recu_check")}
         CHECK (true);

       CREATE TABLE ${qualifiedIdentifier(schemaName, "livraisons")} (
         id integer NOT NULL,
         cooperative_id integer NOT NULL,
         annee integer NOT NULL,
         numero_pesee text
       );
       ALTER TABLE ${qualifiedIdentifier(schemaName, "livraisons")}
         ADD CONSTRAINT ${quoteIdentifier("livraisons_cooperative_annee_numero_pesee_unique")}
         UNIQUE (cooperative_id, annee, numero_pesee);
       ALTER TABLE ${qualifiedIdentifier(schemaName, "livraisons")}
         ADD CONSTRAINT ${quoteIdentifier("livraisons_numero_pesee_complet_check")}
         CHECK (true);

       CREATE TABLE ${qualifiedIdentifier(schemaName, "plan_comptable")} (
         id integer NOT NULL,
         cooperative_id integer NOT NULL,
         numero_compte text NOT NULL,
         actif boolean NOT NULL
       );
       CREATE UNIQUE INDEX ${quoteIdentifier("plan_comptable_cooperative_numero_actif_unique")}
         ON ${qualifiedIdentifier(schemaName, "plan_comptable")}
         (cooperative_id, numero_compte)
         WHERE actif = true;

       CREATE TABLE ${qualifiedIdentifier(schemaName, "commissions_membres_delegues")} (
         id integer NOT NULL,
         retenue_avances_fcfa numeric
       );
       CREATE TABLE ${qualifiedIdentifier(schemaName, "mouvements_caisse")} (
         id integer NOT NULL,
         date_operation date
        );
        CREATE TABLE ${qualifiedIdentifier(schemaName, "charges_diverses")} (
          id integer NOT NULL,
          cooperative_id integer NOT NULL
        );
        CREATE INDEX ${quoteIdentifier("charges_diverses_dettes_fournisseurs_idx")}
          ON ${qualifiedIdentifier(schemaName, "charges_diverses")}
          (cooperative_id);
        CREATE TABLE ${qualifiedIdentifier(schemaName, "reglements_cartes_producteurs")} (
          id integer NOT NULL,
          paiement_id integer NOT NULL,
          cooperative_id integer NOT NULL,
          statut text NOT NULL
        );
        CREATE UNIQUE INDEX ${quoteIdentifier("reglements_cartes_producteurs_paiement_unique")}
          ON ${qualifiedIdentifier(schemaName, "reglements_cartes_producteurs")} (paiement_id);
        CREATE INDEX ${quoteIdentifier("reglements_cartes_producteurs_cooperative_statut_idx")}
          ON ${qualifiedIdentifier(schemaName, "reglements_cartes_producteurs")}
          (cooperative_id, statut)
       );`,
    );
  });

  afterAll(async () => {
    if (schemaName) {
      await client.query(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
    }
    client?.release();
  });

  it("détecte tous les objets critiques créés par les migrations", async () => {
    const isolatedManifest = {
      ...manifest,
      checks: manifest.checks.map((check) => ({
        ...check,
        objects: check.objects.map((object) => ({
          ...object,
          schema: schemaName,
        })),
      })),
    };

    await expect(
      verifySchemaObjects(client, isolatedManifest),
    ).resolves.toBeUndefined();
  });

  it("signale la migration et l'objet lorsqu'un index et une contrainte manquent", async () => {
    const indexCheck = manifest.checks.find(
      (check) => check.migration === "0070_sessions_pesee_unique_en_cours",
    );
    const constraintCheck = manifest.checks.find(
      (check) =>
        check.migration === "0147_paiements_date_validation_obligatoire",
    );
    const index = indexCheck?.objects[0];
    const constraint = constraintCheck?.objects[0];

    if (
      !index ||
      index.kind !== "index" ||
      !index.name ||
      !constraint ||
      constraint.kind !== "constraint" ||
      !constraint.name
    ) {
      throw new Error("Objets attendus absents du manifeste de contrôle");
    }

    const isolatedManifest = {
      ...manifest,
      checks: manifest.checks.map((check) => ({
        ...check,
        objects: check.objects.map((object) => ({
          ...object,
          schema: schemaName,
        })),
      })),
    };

    await client.query("BEGIN");
    try {
      await client.query(
        `DROP INDEX ${qualifiedIdentifier(schemaName, index.name)}`,
      );
      await client.query(
        `ALTER TABLE ${qualifiedIdentifier(schemaName, constraint.table)}
         DROP CONSTRAINT ${quoteIdentifier(constraint.name)}`,
      );

      let failure: unknown;
      try {
        await verifySchemaObjects(client, isolatedManifest);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      const message =
        failure instanceof Error ? failure.message : String(failure);
      expect(message).toContain(
        `0070_sessions_pesee_unique_en_cours → index ${schemaName}.${index.table}.${index.name}`,
      );
      expect(message).toContain(
        `0147_paiements_date_validation_obligatoire → constraint ${schemaName}.${constraint.table}.${constraint.name}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
