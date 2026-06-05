-- ============================================================
-- Migration 027 — Module Équipements & Amortissements
-- ============================================================

-- 1. Catégories d'équipements
CREATE TABLE IF NOT EXISTS categories_equipements (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  libelle                     VARCHAR(200) NOT NULL,
  duree_amortissement_ans     INTEGER NOT NULL DEFAULT 5,
  methode_amortissement       VARCHAR(20) NOT NULL DEFAULT 'lineaire'
                                CHECK (methode_amortissement IN ('lineaire','degressif')),
  compte_immobilisation       VARCHAR(10) NOT NULL DEFAULT '244',
  compte_amortissement        VARCHAR(10) NOT NULL DEFAULT '284',
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Équipements
CREATE TABLE IF NOT EXISTS equipements (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  categorie_id                INTEGER NOT NULL REFERENCES categories_equipements(id),
  designation                 VARCHAR(300) NOT NULL,
  marque                      VARCHAR(100),
  modele                      VARCHAR(100),
  numero_serie                VARCHAR(100),
  date_acquisition            DATE NOT NULL,
  valeur_acquisition_fcfa     NUMERIC(14, 0) NOT NULL,
  valeur_residuelle_fcfa      NUMERIC(14, 0) NOT NULL DEFAULT 0,
  duree_amortissement_ans     INTEGER NOT NULL,
  methode_amortissement       VARCHAR(20) NOT NULL DEFAULT 'lineaire'
                                CHECK (methode_amortissement IN ('lineaire','degressif')),
  valeur_nette_comptable_fcfa NUMERIC(14, 0) NOT NULL,
  cumul_amortissement_fcfa    NUMERIC(14, 0) NOT NULL DEFAULT 0,
  statut                      VARCHAR(20) NOT NULL DEFAULT 'actif'
                                CHECK (statut IN ('actif','hors_service','cede','vole')),
  affecte_a                   VARCHAR(200),
  affecte_user_id             INTEGER REFERENCES users(id),
  date_mise_service           DATE,
  garantie_expiration         DATE,
  photo_url                   VARCHAR(500),
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Dotations d'amortissement
CREATE TABLE IF NOT EXISTS dotations_amortissement (
  id                          SERIAL PRIMARY KEY,
  equipement_id               INTEGER NOT NULL REFERENCES equipements(id),
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  exercice                    INTEGER NOT NULL,
  mois                        INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  dotation_fcfa               NUMERIC(14, 0) NOT NULL,
  cumul_fcfa                  NUMERIC(14, 0) NOT NULL,
  vnc_fcfa                    NUMERIC(14, 0) NOT NULL,
  ecriture_id                 INTEGER REFERENCES ecritures_comptables(id),
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(equipement_id, exercice, mois)
);

-- 4. Maintenances équipement
CREATE TABLE IF NOT EXISTS maintenances_equipement (
  id                          SERIAL PRIMARY KEY,
  equipement_id               INTEGER NOT NULL REFERENCES equipements(id),
  type                        VARCHAR(20) NOT NULL DEFAULT 'preventive'
                                CHECK (type IN ('preventive','corrective','revision')),
  date_maintenance            DATE NOT NULL,
  description                 TEXT,
  cout_fcfa                   NUMERIC(14, 0),
  prestataire                 VARCHAR(200),
  prochaine_maintenance       DATE,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Seed catégories OHADA pour cooperative_id = 1
INSERT INTO categories_equipements (cooperative_id, libelle, duree_amortissement_ans, methode_amortissement, compte_immobilisation, compte_amortissement) VALUES
  (1, 'Matériel transport',     5,  'lineaire', '244', '284'),
  (1, 'Matériel informatique',  3,  'lineaire', '244', '284'),
  (1, 'Matériel de bureau',     5,  'lineaire', '244', '284'),
  (1, 'Mobilier',               10, 'lineaire', '244', '284'),
  (1, 'Bâtiments',              20, 'lineaire', '231', '281'),
  (1, 'Matériel de pesée',      5,  'lineaire', '244', '284'),
  (1, 'Groupe électrogène',     7,  'lineaire', '244', '284'),
  (1, 'Matériel agricole',      7,  'lineaire', '244', '284')
ON CONFLICT DO NOTHING;
