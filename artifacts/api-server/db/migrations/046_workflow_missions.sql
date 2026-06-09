-- Migration 046: Workflow validation membres + missions terrain

-- 1. Nouvelles colonnes sur membres (workflow + données enrichies)
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS statut_membre VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cree_par VARCHAR(30),
  ADD COLUMN IF NOT EXISTS demande_par_delegue_id INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS motif_rejet TEXT,
  ADD COLUMN IF NOT EXISTS valide_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS date_validation TIMESTAMP WITH TIME ZONE,
  -- Contact
  ADD COLUMN IF NOT EXISTS telephone_secondaire VARCHAR(20),
  -- Parcelles enrichies
  ADD COLUMN IF NOT EXISTS nombre_parcelles INTEGER,
  ADD COLUMN IF NOT EXISTS superficie_totale NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS gps_parcelles JSONB,
  ADD COLUMN IF NOT EXISTS culture_principale VARCHAR(50),
  ADD COLUMN IF NOT EXISTS polygone_gps JSONB,
  -- EUDR
  ADD COLUMN IF NOT EXISTS certification VARCHAR(50),
  ADD COLUMN IF NOT EXISTS documents_joints JSONB,
  -- Terrain
  ADD COLUMN IF NOT EXISTS completude_fiche INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gps_collecte_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS gps_valide_par INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS date_collecte_gps TIMESTAMP WITH TIME ZONE;

-- 2. Donner statut_membre DEFAULT pour nouvelles insertions
ALTER TABLE membres ALTER COLUMN statut_membre SET DEFAULT 'en_attente';

-- 3. Migrer les membres existants vers statut actif
UPDATE membres SET statut_membre = 'actif' WHERE statut_membre IS NULL;
UPDATE membres SET cree_par = 'migration' WHERE cree_par IS NULL;

-- 4. Calcul completude_fiche pour membres existants
UPDATE membres SET completude_fiche = (
  CASE WHEN nom IS NOT NULL AND nom != '' THEN 1 ELSE 0 END +
  CASE WHEN prenoms IS NOT NULL AND prenoms != '' THEN 1 ELSE 0 END +
  CASE WHEN telephone IS NOT NULL AND telephone != '' THEN 1 ELSE 0 END +
  CASE WHEN village IS NOT NULL AND village != '' THEN 1 ELSE 0 END +
  CASE WHEN date_naissance IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN sexe IS NOT NULL AND sexe != '' THEN 1 ELSE 0 END +
  CASE WHEN numero_cni IS NOT NULL AND numero_cni != '' THEN 1 ELSE 0 END +
  CASE WHEN gps_parcelles IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN superficie_totale IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN nombre_parcelles IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN date_adhesion IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN type_fournisseur IS NOT NULL AND type_fournisseur != '' THEN 1 ELSE 0 END +
  CASE WHEN nbre_parts_souscrites IS NOT NULL AND nbre_parts_souscrites > 0 THEN 1 ELSE 0 END
) * 100 / 13;

-- 5. Table missions_terrain
CREATE TABLE IF NOT EXISTS missions_terrain (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER REFERENCES cooperatives(id) NOT NULL,
  titre VARCHAR NOT NULL,
  zone_type VARCHAR(30) NOT NULL,
  zone_nom VARCHAR NOT NULL,
  date_prevue DATE NOT NULL,
  agent_id INTEGER REFERENCES users(id),
  cree_par INTEGER REFERENCES users(id),
  statut VARCHAR(20) DEFAULT 'planifiee',
  objectif_parcelles INTEGER,
  parcelles_collectees INTEGER DEFAULT 0,
  motif_rejet TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Table missions_membres (lien mission ↔ membres à mapper)
CREATE TABLE IF NOT EXISTS missions_membres (
  id SERIAL PRIMARY KEY,
  mission_id INTEGER REFERENCES missions_terrain(id) ON DELETE CASCADE NOT NULL,
  membre_id INTEGER REFERENCES membres(id) NOT NULL,
  statut VARCHAR(20) DEFAULT 'a_faire',
  gps_collecte JSONB,
  photos_collectees JSONB,
  notes_agent TEXT,
  date_collecte TIMESTAMP WITH TIME ZONE,
  motif_rejet TEXT
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_membres_statut_membre ON membres(statut_membre);
CREATE INDEX IF NOT EXISTS idx_membres_demande_par ON membres(demande_par_delegue_id);
CREATE INDEX IF NOT EXISTS idx_missions_agent ON missions_terrain(agent_id);
CREATE INDEX IF NOT EXISTS idx_missions_cooperative ON missions_terrain(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_missions_statut ON missions_terrain(statut);
CREATE INDEX IF NOT EXISTS idx_missions_membres_mission ON missions_membres(mission_id);
CREATE INDEX IF NOT EXISTS idx_missions_membres_membre ON missions_membres(membre_id);
