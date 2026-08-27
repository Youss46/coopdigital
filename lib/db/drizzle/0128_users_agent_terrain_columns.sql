-- Migration 0128 : colonnes nécessaires à la création des agents terrain
-- Idempotente pour rattraper les bases initialisées avec un ancien schéma users.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mot_de_passe_temporaire" boolean DEFAULT false NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "zone_type" varchar(20);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "zone_nom" text;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "zone_villages" text;