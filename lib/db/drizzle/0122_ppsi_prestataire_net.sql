ALTER TABLE "charges_diverses"
  ADD COLUMN IF NOT EXISTS "ppsi_taux_pct" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "retenue_ppsi_fcfa" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montant_net_fcfa" integer;