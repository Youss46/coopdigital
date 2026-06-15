-- Migration 0037 : ajout de la capacité en nombre de sacs sur les entrepôts
ALTER TABLE entrepots
  ADD COLUMN IF NOT EXISTS capacite_sacs integer;
