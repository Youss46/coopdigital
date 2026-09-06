-- Persiste le compte de trésorerie utilisé lors du paiement d'un bulletin.
-- IF NOT EXISTS couvre les bases historiques déjà synchronisées par push.
ALTER TABLE "bulletins_paie"
  ADD COLUMN IF NOT EXISTS "compte_source_type" text,
  ADD COLUMN IF NOT EXISTS "compte_source_id" integer;