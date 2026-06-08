-- Migration: logique refus complète
-- À appliquer une seule fois sur la base Railway :
--   psql $DATABASE_URL -f lib/db/src/migration_refus_statut.sql

-- 1. Nouveaux statuts de vente
ALTER TYPE vente_statut ADD VALUE IF NOT EXISTS 'refoule';
ALTER TYPE vente_statut ADD VALUE IF NOT EXISTS 'partiellement_refoule';

-- 2. Colonnes refus sur ventes_exportateurs
ALTER TABLE ventes_exportateurs
  ADD COLUMN IF NOT EXISTS nombre_sacs_refoules integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS poids_refoule_kg numeric(10,2) DEFAULT 0;

-- 3. Colonne entrepôt de retour sur traitements_refus (si absente)
ALTER TABLE traitements_refus
  ADD COLUMN IF NOT EXISTS entrepot_retour_id integer REFERENCES entrepots(id);
