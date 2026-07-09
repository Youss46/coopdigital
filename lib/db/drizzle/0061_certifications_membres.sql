CREATE TABLE IF NOT EXISTS "certifications_membres" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "certification_id" integer NOT NULL REFERENCES "certifications"("id") ON DELETE CASCADE,
  "membre_id" integer NOT NULL REFERENCES "membres"("id") ON DELETE CASCADE,
  "criteres_valides" jsonb NOT NULL DEFAULT '[]',
  "score" integer NOT NULL DEFAULT 0,
  "score_max" integer NOT NULL DEFAULT 0,
  "statut_conformite" varchar(30) NOT NULL DEFAULT 'non_conforme',
  "prime_fcfa_ha" numeric(10,2),
  "notes" text,
  "evalue_par" integer REFERENCES "users"("id"),
  "date_evaluation" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("membre_id", "certification_id")
);

CREATE INDEX IF NOT EXISTS "idx_cm_certification" ON "certifications_membres"("certification_id");
CREATE INDEX IF NOT EXISTS "idx_cm_membre" ON "certifications_membres"("membre_id");
CREATE INDEX IF NOT EXISTS "idx_cm_cooperative" ON "certifications_membres"("cooperative_id");
