DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'avance_deduction_source'
  ) THEN
    CREATE TYPE avance_deduction_source AS ENUM ('livraison', 'commission');
  END IF;
END $$;

ALTER TABLE avances
  ADD COLUMN IF NOT EXISTS deduction_source avance_deduction_source NOT NULL DEFAULT 'livraison';

UPDATE avances
SET deduction_source = 'livraison'
WHERE deduction_source IS NULL;