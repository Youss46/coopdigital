-- Migration 0041 : ajout du nombre de sacs à l'arrivée sur les transferts stock
ALTER TABLE transferts_stock
  ADD COLUMN IF NOT EXISTS nombre_sacs_arrivee integer;
