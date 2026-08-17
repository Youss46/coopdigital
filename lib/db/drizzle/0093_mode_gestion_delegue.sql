-- Migration 0093 : Ajout du mode de gestion pour les délégués
-- "autonome" = délégué utilise la plateforme lui-même (défaut)
-- "central"  = géré par la base centrale (délégué illettré ou sans accès numérique)

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mode_gestion" text DEFAULT 'autonome';
