-- ============================================================
-- Migration 028 — Tables campagnes + Module Prévisions
-- ============================================================

-- 0. Enum campagne_statut (si pas déjà existant)
DO $$ BEGIN
  CREATE TYPE campagne_statut AS ENUM ('ouverte', 'fermee');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Table campagnes (socle manquant dans les migrations précédentes)
CREATE TABLE IF NOT EXISTS campagnes (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER NOT NULL REFERENCES cooperatives(id),
  libelle         TEXT NOT NULL,
  annee_debut     INTEGER NOT NULL,
  annee_fin       INTEGER NOT NULL,
  date_ouverture  DATE NOT NULL,
  date_fermeture  DATE,
  statut          campagne_statut NOT NULL DEFAULT 'ouverte',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Ajouter la colonne campagne_id sur livraisons si elle n'existe pas
DO $$ BEGIN
  ALTER TABLE livraisons ADD COLUMN campagne_id INTEGER REFERENCES campagnes(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Rattacher bilans_campagne à campagnes (elle existe mais sans la FK si campagnes n'existait pas)
DO $$ BEGIN
  ALTER TABLE bilans_campagne ADD CONSTRAINT bilans_campagne_campagne_id_fkey
    FOREIGN KEY (campagne_id) REFERENCES campagnes(id);
EXCEPTION WHEN duplicate_object THEN NULL;
       WHEN undefined_table THEN NULL;
END $$;

-- 2. Prévisions campagne
CREATE TABLE IF NOT EXISTS previsions_campagne (
  id                              SERIAL PRIMARY KEY,
  cooperative_id                  INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id                     INTEGER NOT NULL REFERENCES campagnes(id),

  -- Hypothèses saisies
  tonnage_prevu_kg                NUMERIC(14, 2),
  prix_achat_prevu_fcfa           NUMERIC(12, 0),
  prix_vente_prevu_fcfa           NUMERIC(12, 0),
  nb_membres_prevus               INTEGER,
  nb_semaines_campagne            INTEGER,

  -- Projections calculées
  ca_prevu_fcfa                   NUMERIC(16, 0),
  cout_achat_prevu_fcfa           NUMERIC(16, 0),
  marge_brute_prevue_fcfa         NUMERIC(16, 0),
  marge_kg_prevue_fcfa            NUMERIC(10, 0),

  -- Tendance actuelle
  tonnage_rythme_actuel_kg        NUMERIC(14, 2),
  ca_projection_fin_fcfa          NUMERIC(16, 0),
  marge_projection_fin_fcfa       NUMERIC(16, 0),
  ecart_tonnage_pct               NUMERIC(8, 2),
  ecart_ca_pct                    NUMERIC(8, 2),

  date_derniere_projection        TIMESTAMP WITH TIME ZONE,
  created_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  UNIQUE(cooperative_id, campagne_id)
);

-- 3. Simulations
CREATE TABLE IF NOT EXISTS simulations (
  id                              SERIAL PRIMARY KEY,
  cooperative_id                  INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id                     INTEGER REFERENCES campagnes(id),
  nom_simulation                  VARCHAR(200) NOT NULL,
  type                            VARCHAR(20) NOT NULL DEFAULT 'mix'
                                    CHECK (type IN ('prix','tonnage','membres','mix')),
  parametres                      JSONB NOT NULL DEFAULT '{}',
  resultats                       JSONB NOT NULL DEFAULT '{}',
  created_by                      INTEGER REFERENCES users(id),
  created_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Seed : campagne 2024/2025 pour la coopérative de démonstration
INSERT INTO campagnes (cooperative_id, libelle, annee_debut, annee_fin, date_ouverture, statut)
SELECT 1, 'Campagne 2024-2025', 2024, 2025, '2024-10-01', 'ouverte'
WHERE NOT EXISTS (SELECT 1 FROM campagnes WHERE cooperative_id = 1 AND annee_debut = 2024);
