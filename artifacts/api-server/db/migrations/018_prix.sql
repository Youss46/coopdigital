-- Migration 018 : Module Suivi des Prix
-- historique_prix, alertes_prix, config_prix

DO $$ BEGIN
  CREATE TYPE alerte_prix_type AS ENUM ('marge_faible','prix_bas','prix_eleve','variation_forte');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS historique_prix (
  id                       SERIAL PRIMARY KEY,
  cooperative_id           INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id              INTEGER REFERENCES campagnes(id),
  date_prix                DATE NOT NULL,
  prix_bord_champ_fcfa     NUMERIC(12,2) NOT NULL,
  prix_vente_export_fcfa   NUMERIC(12,2) NOT NULL,
  marge_brute_kg_fcfa      NUMERIC(12,2) GENERATED ALWAYS AS (prix_vente_export_fcfa - prix_bord_champ_fcfa) STORED,
  source                   VARCHAR(100) DEFAULT 'manuel',
  saisi_par                INTEGER REFERENCES users(id),
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alertes_prix (
  id                   SERIAL PRIMARY KEY,
  cooperative_id       INTEGER NOT NULL REFERENCES cooperatives(id),
  type                 alerte_prix_type NOT NULL,
  seuil_configure      NUMERIC(12,2),
  valeur_declenchante  NUMERIC(12,2),
  message              VARCHAR(500),
  lu                   BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS config_prix (
  id                            SERIAL PRIMARY KEY,
  cooperative_id                INTEGER NOT NULL UNIQUE REFERENCES cooperatives(id),
  seuil_marge_minimum_fcfa      NUMERIC(12,2) DEFAULT 100,
  seuil_variation_alerte_pct    NUMERIC(5,2)  DEFAULT 10,
  diffusion_auto_sms            BOOLEAN NOT NULL DEFAULT false,
  updated_at                    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_prix_coop_date ON historique_prix(cooperative_id, date_prix DESC);
CREATE INDEX IF NOT EXISTS idx_alertes_prix_coop_lu      ON alertes_prix(cooperative_id, lu, created_at DESC);

-- Config par défaut pour cooperative 1
INSERT INTO config_prix (cooperative_id, seuil_marge_minimum_fcfa, seuil_variation_alerte_pct, diffusion_auto_sms)
VALUES (1, 100, 10, false)
ON CONFLICT (cooperative_id) DO NOTHING;
