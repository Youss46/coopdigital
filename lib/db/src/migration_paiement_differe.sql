-- Migration : paiement différé sur livraisons
-- À appliquer une seule fois sur la base Railway :
--   psql $DATABASE_URL -f lib/db/src/migration_paiement_differe.sql

ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS statut_paiement    VARCHAR(50)     DEFAULT 'PAYÉ',
  ADD COLUMN IF NOT EXISTS montant_restant    DECIMAL(12,2)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_paiement_prevue DATE;
