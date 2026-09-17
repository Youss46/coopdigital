ALTER TABLE "membres"
  ADD COLUMN IF NOT EXISTS "annee_naissance" integer;

ALTER TABLE "membres"
  ADD COLUMN IF NOT EXISTS "identifiant_source" text;

CREATE UNIQUE INDEX IF NOT EXISTS "membres_cooperative_identifiant_source_unique"
  ON "membres" ("cooperative_id", "identifiant_source")
  WHERE "identifiant_source" IS NOT NULL;