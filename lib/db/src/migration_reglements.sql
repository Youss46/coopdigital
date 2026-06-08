-- Migration règlements : nouveaux statuts + colonnes validation/rejet
-- À appliquer : psql $DATABASE_URL -f lib/db/src/migration_reglements.sql

-- 1. Ajout des nouvelles valeurs à l'enum paiement_statut
DO $$ BEGIN
  ALTER TYPE paiement_statut ADD VALUE IF NOT EXISTS 'rejete';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE paiement_statut ADD VALUE IF NOT EXISTS 'en_cours';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE paiement_statut ADD VALUE IF NOT EXISTS 'effectue';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajout des colonnes de validation/rejet
ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS valide_par     INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS date_validation TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS motif_rejet    TEXT,
  ADD COLUMN IF NOT EXISTS initialise_par INTEGER REFERENCES users(id);
