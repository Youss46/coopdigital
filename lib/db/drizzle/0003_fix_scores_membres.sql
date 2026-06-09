-- Colonne manquante dans scores_membres (ajoutée au schéma après la migration initiale)
ALTER TABLE "scores_membres" ADD COLUMN IF NOT EXISTS "score_regularite" numeric(6, 2);--> statement-breakpoint

-- Contrainte unique requise pour le ON CONFLICT de l'upsert scoring
DO $$ BEGIN
  ALTER TABLE "scores_membres" ADD CONSTRAINT "scores_membres_cooperative_membre_campagne_unique"
    UNIQUE ("cooperative_id", "membre_id", "campagne_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
