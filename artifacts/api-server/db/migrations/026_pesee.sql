-- 026_pesee.sql — Module pesée : balances, double pesée, litiges

-- 1. Balances
CREATE TABLE IF NOT EXISTS balances (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  numero_serie                VARCHAR(100) UNIQUE,
  marque                      VARCHAR(100),
  capacite_max_kg             NUMERIC(10, 2),
  precision_g                 NUMERIC(8, 1),
  site                        VARCHAR(200),
  date_acquisition            DATE,
  date_derniere_verification  DATE,
  date_prochaine_verification DATE,
  statut                      VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Enrichissement de la table livraisons
ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS balance_id                INTEGER REFERENCES balances(id),
  ADD COLUMN IF NOT EXISTS peseur_id                 INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS poids_brut_1ere_pesee_kg  NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS poids_brut_2eme_pesee_kg  NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS ecart_pesee_kg            NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS ecart_pesee_pct           NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS poids_retenu_kg           NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS double_pesee_requise      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS double_pesee_effectuee    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS litige_pesee              BOOLEAN DEFAULT false;

-- 3. Config pesée (1 ligne par coopérative)
CREATE TABLE IF NOT EXISTS config_pesee (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL UNIQUE REFERENCES cooperatives(id),
  ecart_max_autorise_pct      NUMERIC(5, 2) DEFAULT 2,
  seuil_double_pesee_kg       NUMERIC(10, 2) DEFAULT 500,
  tolerance_balance_g         NUMERIC(8, 1) DEFAULT 500,
  frequence_verification_jours INTEGER DEFAULT 90,
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Vérifications balance
CREATE TABLE IF NOT EXISTS verifications_balance (
  id                    SERIAL PRIMARY KEY,
  balance_id            INTEGER NOT NULL REFERENCES balances(id),
  date_verification     DATE NOT NULL,
  verificateur          VARCHAR(200),
  resultat              VARCHAR(30) NOT NULL DEFAULT 'conforme',
  ecart_mesure_g        NUMERIC(8, 1),
  observations          TEXT,
  prochaine_verification DATE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 5. Litiges pesée
CREATE TABLE IF NOT EXISTS litiges_pesee (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  livraison_id                INTEGER NOT NULL REFERENCES livraisons(id),
  membre_id                   INTEGER REFERENCES membres(id),
  date_litige                 DATE NOT NULL,
  poids_conteste_kg           NUMERIC(10, 3),
  poids_revendique_membre_kg  NUMERIC(10, 3),
  motif                       VARCHAR(500),
  statut                      VARCHAR(30) NOT NULL DEFAULT 'ouvert',
  decision                    TEXT,
  poids_final_retenu_kg       NUMERIC(10, 3),
  difference_fcfa             NUMERIC(12, 0),
  resolu_par                  INTEGER REFERENCES users(id),
  resolu_le                   TIMESTAMP WITH TIME ZONE,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
