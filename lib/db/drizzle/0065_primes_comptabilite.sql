-- Migration 0065 : Ajout colonne auto_primes dans config_comptable
-- pour les écritures OHADA liées aux réceptions et paiements de primes

ALTER TABLE "config_comptable"
  ADD COLUMN IF NOT EXISTS "auto_primes" boolean NOT NULL DEFAULT false;
