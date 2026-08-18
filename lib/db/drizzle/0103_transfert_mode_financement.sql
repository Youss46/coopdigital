ALTER TABLE "transferts_stock"
  ADD COLUMN "mode_financement" text NOT NULL DEFAULT 'fonds_propres'
  CHECK ("mode_financement" IN ('fonds_propres', 'caisse_cooperative'));
