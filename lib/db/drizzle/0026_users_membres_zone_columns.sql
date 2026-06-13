-- Migration 0026 : colonnes zone + carte_producteur manquantes
-- users : zone_type, zone_nom, zone_villages
-- membres : zone_type, zone_nom, carte_producteur

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS zone_type     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS zone_nom      TEXT,
  ADD COLUMN IF NOT EXISTS zone_villages TEXT;

ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS zone_type        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS zone_nom         TEXT,
  ADD COLUMN IF NOT EXISTS carte_producteur VARCHAR(100);
