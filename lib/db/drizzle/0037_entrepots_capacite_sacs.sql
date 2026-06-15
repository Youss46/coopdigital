-- Migration 0037 : ajout de la capacité en nombre de sacs sur les entrepôts délégués
ALTER TABLE entrepots_delegues
  ADD COLUMN IF NOT EXISTS capacite_sacs integer;
