ALTER TABLE "composantes_salaire"
  ADD COLUMN IF NOT EXISTS "plafond_exoneration_fcfa" integer;
--> statement-breakpoint
ALTER TABLE "lignes_bulletin"
  ADD COLUMN IF NOT EXISTS "montant_exonere_its_cnps_fcfa" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "composantes_salaire_transport_exoneree_unique"
  ON "composantes_salaire" ("cooperative_id")
  WHERE "plafond_exoneration_fcfa" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'composantes_salaire_plafond_exoneration_check'
      AND conrelid = 'public.composantes_salaire'::regclass
  ) THEN
    ALTER TABLE "composantes_salaire"
      ADD CONSTRAINT "composantes_salaire_plafond_exoneration_check"
      CHECK (
        "plafond_exoneration_fcfa" IS NULL
        OR (
          "plafond_exoneration_fcfa" >= 0
          AND "type" = 'avantage'
          AND "calcul" = 'fixe'
        )
      );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lignes_bulletin_exoneration_borne_check'
      AND conrelid = 'public.lignes_bulletin'::regclass
  ) THEN
    ALTER TABLE "lignes_bulletin"
      ADD CONSTRAINT "lignes_bulletin_exoneration_borne_check"
      CHECK (
        "montant_exonere_its_cnps_fcfa" >= 0
        AND "montant_exonere_its_cnps_fcfa" <= "montant_fcfa"
        AND (
          "montant_exonere_its_cnps_fcfa" = 0
          OR "type" = 'avantage'
        )
      );
  END IF;
END $$;
