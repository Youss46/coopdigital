ALTER TABLE "charges_diverses"
  ADD COLUMN IF NOT EXISTS "compte_tresorerie_id" integer,
  ADD COLUMN IF NOT EXISTS "compte_tresorerie_type" varchar(20);