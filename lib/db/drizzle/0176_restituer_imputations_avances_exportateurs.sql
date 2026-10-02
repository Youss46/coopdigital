ALTER TABLE "public"."imputations_avances_exportateurs"
  ADD COLUMN IF NOT EXISTS "montant_restitue_fcfa" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."imputations_avances_exportateurs"
  ADD COLUMN IF NOT EXISTS "date_restitution" date;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "public"."imputations_avances_exportateurs"
    ADD CONSTRAINT "imputations_avances_exportateurs_restitution_borne_check"
    CHECK ("montant_restitue_fcfa" >= 0 AND "montant_restitue_fcfa" <= "montant_fcfa");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;