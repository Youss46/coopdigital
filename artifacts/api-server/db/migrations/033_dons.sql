-- Migration 033 : Module Dons (effectués & reçus)

-- ── Étendre les enums comptables ──────────────────────────────────────────────
ALTER TYPE source_ecriture ADD VALUE IF NOT EXISTS 'don';
ALTER TYPE source_ecriture_attente ADD VALUE IF NOT EXISTS 'don';

-- ── Ajouter auto_dons dans config_comptable ──────────────────────────────────
ALTER TABLE config_comptable ADD COLUMN IF NOT EXISTS auto_dons BOOLEAN NOT NULL DEFAULT false;

-- ── 1. categories_dons ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories_dons (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL REFERENCES cooperatives(id),
  libelle          VARCHAR(200) NOT NULL,
  sens             VARCHAR(20) NOT NULL CHECK (sens IN ('effectue', 'recu')),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. dons ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dons (
  id                       SERIAL PRIMARY KEY,
  cooperative_id           INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id              INTEGER REFERENCES campagnes(id),

  -- Sens et forme
  sens                     VARCHAR(20) NOT NULL CHECK (sens IN ('effectue', 'recu')),
  forme                    VARCHAR(20) NOT NULL CHECK (forme IN ('especes', 'nature')),
  categorie_id             INTEGER REFERENCES categories_dons(id),

  -- Référence
  reference                VARCHAR(50) UNIQUE,
  libelle                  VARCHAR(300) NOT NULL,
  description              TEXT,
  date_don                 DATE NOT NULL,

  -- Bénéficiaire (si don effectué)
  beneficiaire_type        VARCHAR(50),
  beneficiaire_membre_id   INTEGER REFERENCES membres(id) NULL,
  beneficiaire_nom         VARCHAR(200),
  beneficiaire_village     VARCHAR(200),
  beneficiaire_contact     VARCHAR(100),

  -- Donateur (si don reçu)
  donateur_type            VARCHAR(50),
  donateur_nom             VARCHAR(200),
  donateur_contact         VARCHAR(100),

  -- Montant espèces
  montant_fcfa             NUMERIC DEFAULT 0,

  -- Don en nature
  valeur_estimee_fcfa      NUMERIC DEFAULT 0,

  -- Validation
  statut                   VARCHAR(20) NOT NULL DEFAULT 'brouillon'
                             CHECK (statut IN ('brouillon', 'valide', 'annule')),
  valide_par               INTEGER REFERENCES users(id),
  date_validation          TIMESTAMP WITH TIME ZONE,
  motif_annulation         TEXT,

  -- Justificatif
  pv_remise                BOOLEAN DEFAULT false,
  pv_url                   VARCHAR(500),
  photo_url                VARCHAR(500),

  -- Comptabilité
  ecriture_generee         BOOLEAN DEFAULT false,

  -- Méta
  enregistre_par           INTEGER REFERENCES users(id),
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE
);

-- ── 3. lignes_don_nature ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lignes_don_nature (
  id                    SERIAL PRIMARY KEY,
  don_id                INTEGER NOT NULL REFERENCES dons(id) ON DELETE CASCADE,
  designation           VARCHAR(300) NOT NULL,
  quantite              NUMERIC NOT NULL,
  unite                 VARCHAR(50) NOT NULL,
  valeur_unitaire_fcfa  NUMERIC NOT NULL,
  valeur_totale_fcfa    NUMERIC GENERATED ALWAYS AS (quantite * valeur_unitaire_fcfa) STORED,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 4. programme_dons ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programme_dons (
  id                   SERIAL PRIMARY KEY,
  cooperative_id       INTEGER NOT NULL REFERENCES cooperatives(id),
  libelle              VARCHAR(300) NOT NULL,
  description          TEXT,
  budget_alloue_fcfa   NUMERIC NOT NULL,
  budget_utilise_fcfa  NUMERIC DEFAULT 0,
  date_debut           DATE,
  date_fin             DATE,
  statut               VARCHAR(20) NOT NULL DEFAULT 'actif'
                         CHECK (statut IN ('actif', 'cloture')),
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Seed catégories dons effectués ───────────────────────────────────────────
INSERT INTO categories_dons (cooperative_id, libelle, sens) VALUES
  (1, 'Aide sociale membre (décès, maladie, sinistre)', 'effectue'),
  (1, 'Don communautaire (école, mosquée, église, puits)', 'effectue'),
  (1, 'Don en nature (vivres, intrants, médicaments)', 'effectue'),
  (1, 'Aide d''urgence (catastrophe, accident)', 'effectue'),
  (1, 'Don associatif (groupement femmes, jeunes)', 'effectue'),
  (1, 'Frais funéraires membre ou famille', 'effectue')
ON CONFLICT DO NOTHING;

-- ── Seed catégories dons reçus ───────────────────────────────────────────────
INSERT INTO categories_dons (cooperative_id, libelle, sens) VALUES
  (1, 'Subvention en nature (GIZ, FIRCA, ONG)', 'recu'),
  (1, 'Don partenaire exportateur', 'recu'),
  (1, 'Don État / collectivité', 'recu'),
  (1, 'Don particulier', 'recu')
ON CONFLICT DO NOTHING;
