-- Migration 0099 : charges de transport sur les transferts délégué → central.
-- Permet au délégué de saisir le coût carburant et les autres charges lors de la création du transfert.

ALTER TABLE transferts_stock
  ADD COLUMN IF NOT EXISTS frais_carburant_fcfa  integer,
  ADD COLUMN IF NOT EXISTS autres_charges_fcfa   integer,
  ADD COLUMN IF NOT EXISTS autres_charges_libelle varchar(300);
