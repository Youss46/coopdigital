-- Migration 045: Rattachement des membres aux délégués de localité ou base centrale
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS delegue_id INTEGER REFERENCES users(id) NULL,
  ADD COLUMN IF NOT EXISTS rattachement_type VARCHAR(20) DEFAULT 'delegue',
  ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS zone_nom TEXT,
  ADD COLUMN IF NOT EXISTS cree_par_delegue BOOLEAN DEFAULT false;

-- Index pour filtrage rapide par délégué
CREATE INDEX IF NOT EXISTS idx_membres_delegue_id ON membres(delegue_id);
CREATE INDEX IF NOT EXISTS idx_membres_rattachement_type ON membres(rattachement_type);
