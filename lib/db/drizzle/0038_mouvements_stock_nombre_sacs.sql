-- Migration 0038 : ajout de la quantité en sacs sur les mouvements de stock manuels
ALTER TABLE mouvements_stock
  ADD COLUMN IF NOT EXISTS nombre_sacs integer;
