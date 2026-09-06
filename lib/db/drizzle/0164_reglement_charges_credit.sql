ALTER TABLE "charges_diverses"
  ADD COLUMN IF NOT EXISTS "montant_regle_fcfa" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "date_reglement" date,
  ADD COLUMN IF NOT EXISTS "regle_par" integer,
  ADD COLUMN IF NOT EXISTS "compte_reglement_id" integer,
  ADD COLUMN IF NOT EXISTS "compte_reglement_type" varchar(20),
  ADD COLUMN IF NOT EXISTS "reference_reglement" varchar(100);

CREATE INDEX IF NOT EXISTS "charges_diverses_dettes_fournisseurs_idx"
  ON "charges_diverses" ("cooperative_id", "statut", "mode_paiement", "compte_credit");