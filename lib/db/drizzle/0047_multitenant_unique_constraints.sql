-- Migration 0047 : contraintes uniques multi-tenant
-- Remplace les contraintes uniques globales par des contraintes composites
-- (cooperative_id, colonne) pour garantir l'isolation entre coopératives.

-- 1. expeditions : numero_expedition unique par coopérative
ALTER TABLE expeditions DROP CONSTRAINT IF EXISTS expeditions_numero_expedition_key;
CREATE UNIQUE INDEX IF NOT EXISTS expeditions_coop_numero_uq
  ON expeditions (cooperative_id, numero_expedition);

-- 2. transferts_stock : numero_transfert unique par coopérative
ALTER TABLE transferts_stock DROP CONSTRAINT IF EXISTS transferts_stock_numero_transfert_key;
CREATE UNIQUE INDEX IF NOT EXISTS transferts_stock_coop_numero_uq
  ON transferts_stock (cooperative_id, numero_transfert);

-- 3. dons : reference unique par coopérative (colonne nullable)
ALTER TABLE dons DROP CONSTRAINT IF EXISTS dons_reference_key;
CREATE UNIQUE INDEX IF NOT EXISTS dons_coop_reference_uq
  ON dons (cooperative_id, reference)
  WHERE reference IS NOT NULL;
