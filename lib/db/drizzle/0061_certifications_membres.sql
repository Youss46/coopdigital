CREATE TABLE IF NOT EXISTS "certifications_membres" (
  "id" serial PRIMARY KEY,
  "membre_id" integer NOT NULL REFERENCES "membres"("id") ON DELETE CASCADE,
  "certification_id" integer NOT NULL REFERENCES "certifications"("id") ON DELETE CASCADE,
  "criteres_valides" jsonb NOT NULL DEFAULT '[]',
  "score" integer NOT NULL DEFAULT 0,
  "score_max" integer NOT NULL DEFAULT 0,
  "statut_conformite" varchar(20) NOT NULL DEFAULT 'non_conforme',
  "prime_fcfa_ha" numeric(12,2),
  "notes" text,
  "date_evaluation" date,
  "evalue_par" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("membre_id", "certification_id")
);

CREATE INDEX IF NOT EXISTS "idx_certifications_membres_certification_id" ON "certifications_membres"("certification_id");
CREATE INDEX IF NOT EXISTS "idx_certifications_membres_membre_id" ON "certifications_membres"("membre_id");
