-- Migration 0053 : garantit que les colonnes d'agrément pisteurs existent sur fournisseurs
-- Idempotent — IF NOT EXISTS protège contre les envs où 0006/0028 avaient déjà été appliqués
ALTER TABLE "fournisseurs"
  ADD COLUMN IF NOT EXISTS "statut_agrement" text DEFAULT 'agree',
  ADD COLUMN IF NOT EXISTS "date_agrement" date,
  ADD COLUMN IF NOT EXISTS "date_expiration_agrement" date;
