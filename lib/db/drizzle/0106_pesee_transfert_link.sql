-- 0106_pesee_transfert_link.sql
-- Ajoute les valeurs d'enum manquantes et les colonnes de liaison
-- entre sessions_pesee et transferts_stock.

-- 1. Valeurs d'enum transfert_statut : 'arrive' et 'en_pesee'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'arrive'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transfert_statut')
  ) THEN
    ALTER TYPE "transfert_statut" ADD VALUE 'arrive';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'en_pesee'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transfert_statut')
  ) THEN
    ALTER TYPE "transfert_statut" ADD VALUE 'en_pesee';
  END IF;
END $$;

-- 2. Colonne session_pesee_id sur transferts_stock
ALTER TABLE "transferts_stock"
  ADD COLUMN IF NOT EXISTS "session_pesee_id" integer;

-- 3. Colonne transfert_id sur sessions_pesee
ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "transfert_id" integer;
