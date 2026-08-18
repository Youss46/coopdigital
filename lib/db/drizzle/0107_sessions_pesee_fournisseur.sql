-- Migration 0107 : fournisseur_id sur sessions_pesee
-- Permet la pesée groupée pour les fournisseurs externes (pisteurs).
ALTER TABLE "sessions_pesee" ADD COLUMN IF NOT EXISTS "fournisseur_id" integer REFERENCES "fournisseurs"("id");
