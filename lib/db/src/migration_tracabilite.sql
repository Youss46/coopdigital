-- Migration: ajout statuts refoule + fusionne sur lot_statut, et colonne parent_lot_id
-- À appliquer : psql $DATABASE_URL -f lib/db/src/migration_tracabilite.sql

-- 1. Étendre l'enum lot_statut
ALTER TYPE lot_statut ADD VALUE IF NOT EXISTS 'refoule';
ALTER TYPE lot_statut ADD VALUE IF NOT EXISTS 'fusionne';

-- 2. Colonne pour tracer le lot parent lors d'une fusion
ALTER TABLE lots ADD COLUMN IF NOT EXISTS parent_lot_ids integer[] DEFAULT NULL;

-- 3. Colonne pour lier un lot à une vente exportateur (sens direct lot → vente)
--    (sens inverse déjà géré via ventes_exportateurs.lot_id)
--    Utilisé par le bouton "Expédier"
ALTER TABLE lots ADD COLUMN IF NOT EXISTS vente_exportateur_id integer REFERENCES ventes_exportateurs(id) ON DELETE SET NULL;
