-- Migration : scission de completude_fiche en 2 groupes (identité + EUDR)
-- Ajouter les colonnes terrain sur membres si elles n'existent pas encore
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS statut_membre VARCHAR(20) DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS cree_par VARCHAR(30),
  ADD COLUMN IF NOT EXISTS demande_par_delegue_id INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS motif_rejet TEXT,
  ADD COLUMN IF NOT EXISTS valide_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS date_validation TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS telephone_secondaire VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nombre_parcelles INTEGER,
  ADD COLUMN IF NOT EXISTS superficie_totale NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS gps_parcelles JSONB,
  ADD COLUMN IF NOT EXISTS culture_principale VARCHAR(50),
  ADD COLUMN IF NOT EXISTS polygone_gps JSONB,
  ADD COLUMN IF NOT EXISTS certification VARCHAR(50),
  ADD COLUMN IF NOT EXISTS documents_joints JSONB,
  ADD COLUMN IF NOT EXISTS gps_collecte_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS gps_valide_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS date_collecte_gps TIMESTAMP WITH TIME ZONE;

-- Migrer les membres existants vers statut actif
UPDATE membres SET statut_membre = 'actif' WHERE statut_membre IS NULL;
UPDATE membres SET cree_par = 'migration' WHERE cree_par IS NULL;

-- Colonnes de complétude
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS completude_fiche INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completude_identite INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completude_eudr INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statut_eudr VARCHAR(20) DEFAULT 'non_conforme',
  ADD COLUMN IF NOT EXISTS mission_gps_requise BOOLEAN DEFAULT false;

-- Groupe A (10 champs) — identité pour activation
UPDATE membres SET completude_identite = (
  (CASE WHEN nom IS NOT NULL AND nom <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN prenoms IS NOT NULL AND prenoms <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN telephone IS NOT NULL AND telephone <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN village IS NOT NULL AND village <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN date_naissance IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN sexe IS NOT NULL AND sexe <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN numero_cni IS NOT NULL AND numero_cni <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN date_adhesion IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN type_fournisseur IS NOT NULL AND type_fournisseur <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN nbre_parts_souscrites > 0 THEN 1 ELSE 0 END)
) * 100 / 10;

-- Groupe B (3 champs) — données terrain EUDR
UPDATE membres SET completude_eudr = (
  (CASE WHEN gps_parcelles IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN superficie_totale IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN nombre_parcelles IS NOT NULL THEN 1 ELSE 0 END)
) * 100 / 3;

-- statut_eudr : conforme si groupe B = 100%
UPDATE membres SET statut_eudr = 'conforme' WHERE completude_eudr = 100;

-- mission_gps_requise : membres actifs sans groupe B complet
UPDATE membres
  SET mission_gps_requise = true
  WHERE statut_membre = 'actif' AND completude_eudr < 100;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_membres_statut_membre ON membres(statut_membre);
CREATE INDEX IF NOT EXISTS idx_membres_demande_par ON membres(demande_par_delegue_id);
