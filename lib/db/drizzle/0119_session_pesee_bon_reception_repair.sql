-- Rattrapage pour les bases ayant déjà enregistré la migration 0118 sans la
-- colonne bon_reception_id (le SQL original l'utilisait sans la créer).
ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "bon_reception_id" integer
  REFERENCES "bons_reception_membres_delegues"("id");

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_pesee_bon_reception_unique"
  ON "sessions_pesee" ("bon_reception_id")
  WHERE "bon_reception_id" IS NOT NULL;