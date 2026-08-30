ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "expedition_id" integer REFERENCES "expeditions"("id"),
  ADD COLUMN IF NOT EXISTS "prechargement_statut" varchar(20),
  ADD COLUMN IF NOT EXISTS "prechargement_ecart_kg" numeric(12, 3),
  ADD COLUMN IF NOT EXISTS "prechargement_ecart_pct" numeric(8, 3),
  ADD COLUMN IF NOT EXISTS "prechargement_justification" text;

ALTER TABLE "expeditions"
  ADD COLUMN IF NOT EXISTS "poids_prevu_kg" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "poids_charge_effectif_kg" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "nombre_sacs_effectif" integer;

UPDATE "expeditions"
SET "poids_prevu_kg" = "poids_charge_kg"
WHERE "poids_prevu_kg" IS NULL;

CREATE INDEX IF NOT EXISTS "sessions_pesee_expedition_id_idx"
  ON "sessions_pesee" ("expedition_id");

CREATE INDEX IF NOT EXISTS "sessions_pesee_prechargement_active_idx"
  ON "sessions_pesee" ("expedition_id")
  WHERE "operation" = 'prechargement_export' AND "statut" = 'en_cours';