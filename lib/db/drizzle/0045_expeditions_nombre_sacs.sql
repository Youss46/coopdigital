-- Migration 0045 : s'assurer que nombre_sacs existe bien sur expeditions
-- La colonne était dans la CREATE TABLE initiale (0020/0025) mais si la table
-- a été créée avant ces migrations (via drizzle-kit push), IF NOT EXISTS l'a skippée.
-- Cette migration est idempotente et corrige le drift en production.
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS nombre_sacs INTEGER;
