ALTER TABLE "paiements"
  ADD COLUMN IF NOT EXISTS "depense_vehicule_id" integer
  REFERENCES "depenses_vehicule"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "paiements_depense_vehicule_id_unique"
  ON "paiements" ("depense_vehicule_id")
  WHERE "depense_vehicule_id" IS NOT NULL;