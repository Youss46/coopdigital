-- Migration 016 : Module Subventions / Bailleurs

-- Enums
CREATE TYPE bailleur_type     AS ENUM ('ong','institution','etat','prive');
CREATE TYPE subvention_statut AS ENUM ('en_attente','actif','cloture','suspendu');
CREATE TYPE tranche_statut    AS ENUM ('attendue','recue','en_retard');
CREATE TYPE rapport_statut    AS ENUM ('brouillon','soumis','valide');

-- 1. Bailleurs
CREATE TABLE bailleurs (
  id                 SERIAL PRIMARY KEY,
  cooperative_id     INTEGER NOT NULL REFERENCES cooperatives(id),
  nom                VARCHAR(200) NOT NULL,
  type               bailleur_type NOT NULL DEFAULT 'ong',
  pays               VARCHAR(100),
  contact_nom        VARCHAR(150),
  contact_email      VARCHAR(200),
  contact_telephone  VARCHAR(50),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Subventions
CREATE TABLE subventions (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL REFERENCES cooperatives(id),
  bailleur_id             INTEGER NOT NULL REFERENCES bailleurs(id),
  reference               VARCHAR(100) UNIQUE NOT NULL,
  libelle                 VARCHAR(300) NOT NULL,
  montant_total_fcfa      NUMERIC(18,2) NOT NULL,
  montant_recu_fcfa       NUMERIC(18,2) NOT NULL DEFAULT 0,
  montant_solde_fcfa      NUMERIC(18,2) NOT NULL DEFAULT 0,
  devise_origine          VARCHAR(10) NOT NULL DEFAULT 'XOF',
  montant_devise_origine  NUMERIC(18,4),
  date_convention         DATE,
  date_debut              DATE,
  date_fin                DATE,
  statut                  subvention_statut NOT NULL DEFAULT 'en_attente',
  conditions              TEXT,
  rapport_requis          BOOLEAN NOT NULL DEFAULT TRUE,
  periodicite_rapport     VARCHAR(30),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tranches de subvention
CREATE TABLE tranches_subvention (
  id                  SERIAL PRIMARY KEY,
  subvention_id       INTEGER NOT NULL REFERENCES subventions(id) ON DELETE CASCADE,
  numero_tranche      INTEGER NOT NULL,
  montant_fcfa        NUMERIC(18,2) NOT NULL,
  date_prevue         DATE,
  date_recue          DATE,
  statut              tranche_statut NOT NULL DEFAULT 'attendue',
  reference_virement  VARCHAR(150),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Lignes budget par subvention
CREATE TABLE lignes_budget_subvention (
  id                   SERIAL PRIMARY KEY,
  subvention_id        INTEGER NOT NULL REFERENCES subventions(id) ON DELETE CASCADE,
  poste_budgetaire     VARCHAR(150) NOT NULL,
  montant_alloue_fcfa  NUMERIC(18,2) NOT NULL DEFAULT 0,
  montant_utilise_fcfa NUMERIC(18,2) NOT NULL DEFAULT 0,
  solde_fcfa           NUMERIC(18,2) GENERATED ALWAYS AS (montant_alloue_fcfa - montant_utilise_fcfa) STORED,
  justificatif_url     VARCHAR(500)
);

-- 5. Rapports bailleurs
CREATE TABLE rapports_bailleurs (
  id              SERIAL PRIMARY KEY,
  subvention_id   INTEGER NOT NULL REFERENCES subventions(id) ON DELETE CASCADE,
  cooperative_id  INTEGER NOT NULL REFERENCES cooperatives(id),
  periode         VARCHAR(50),
  type_rapport    VARCHAR(30),
  statut          rapport_statut NOT NULL DEFAULT 'brouillon',
  date_soumission DATE,
  contenu_json    JSONB,
  pdf_url         VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX idx_subventions_cooperative ON subventions(cooperative_id);
CREATE INDEX idx_subventions_bailleur    ON subventions(bailleur_id);
CREATE INDEX idx_subventions_statut      ON subventions(statut);
CREATE INDEX idx_tranches_subvention     ON tranches_subvention(subvention_id);
CREATE INDEX idx_lignes_budget_sub       ON lignes_budget_subvention(subvention_id);
CREATE INDEX idx_rapports_subvention     ON rapports_bailleurs(subvention_id);
