-- Migration 0040 : ajout du nombre de sacs sur les transferts stock
ALTER TABLE transferts_stock
  ADD COLUMN IF NOT EXISTS nombre_sacs integer;
