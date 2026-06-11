-- Migration : ajout du prix unitaire sur les mouvements de stock

ALTER TABLE mouvements_stock
  ADD COLUMN IF NOT EXISTS prix_unitaire_fcfa NUMERIC(12, 2);
