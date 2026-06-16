-- Migration : ajout colonne nombre_sacs_arrivee sur transferts_stock

ALTER TABLE transferts_stock
  ADD COLUMN IF NOT EXISTS nombre_sacs_arrivee integer;
