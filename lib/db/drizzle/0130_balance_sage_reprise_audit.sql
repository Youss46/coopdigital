CREATE TABLE IF NOT EXISTS "balance_sage_reprise_audit" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL,
  "import_id" integer NOT NULL,
  "exercice" integer NOT NULL,
  "action" varchar(20) NOT NULL,
  "statut" varchar(20) NOT NULL,
  "user_id" integer,
  "message" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "balance_sage_reprise_audit_coop_exercice_idx"
  ON "balance_sage_reprise_audit" ("cooperative_id", "exercice");
CREATE INDEX IF NOT EXISTS "balance_sage_reprise_audit_import_idx"
  ON "balance_sage_reprise_audit" ("import_id");
CREATE INDEX IF NOT EXISTS "balance_sage_reprise_audit_created_at_idx"
  ON "balance_sage_reprise_audit" ("created_at");