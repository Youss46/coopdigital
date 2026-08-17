-- Migration 0101 : prise en charge des frais de transport (coopérative ou délégué).
-- Si "cooperative" → déduire de la commission du délégué.
-- Si "delegue"     → à sa charge, ne pas déduire.

ALTER TABLE transferts_stock
  ADD COLUMN IF NOT EXISTS frais_carburant_par varchar(20),
  ADD COLUMN IF NOT EXISTS autres_charges_par  varchar(20);
