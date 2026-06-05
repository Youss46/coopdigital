-- ============================================================
-- Module Budget Prévisionnel — Migration 015
-- ============================================================

CREATE TYPE budget_statut AS ENUM ('brouillon', 'valide', 'cloture');

CREATE TABLE budgets_campagne (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id      INTEGER NOT NULL REFERENCES campagnes(id),
  statut           budget_statut NOT NULL DEFAULT 'brouillon',
  valide_par       INTEGER REFERENCES users(id),
  date_validation  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, campagne_id)
);

CREATE TYPE budget_categorie AS ENUM (
  'recette',
  'charge_achat',
  'charge_exploitation',
  'charge_personnel',
  'charge_financiere',
  'investissement'
);

CREATE TABLE lignes_budget (
  id                       SERIAL PRIMARY KEY,
  budget_id                INTEGER NOT NULL REFERENCES budgets_campagne(id) ON DELETE CASCADE,
  categorie                budget_categorie NOT NULL,
  libelle                  VARCHAR(200) NOT NULL,
  montant_previsionnel_fcfa NUMERIC(16,2) NOT NULL DEFAULT 0,
  montant_realise_fcfa      NUMERIC(16,2) NOT NULL DEFAULT 0,
  ecart_fcfa               NUMERIC(16,2) GENERATED ALWAYS AS
                             (montant_realise_fcfa - montant_previsionnel_fcfa) STORED,
  ecart_pct                NUMERIC(8,4),
  ordre                    INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hypotheses_budget (
  id                        SERIAL PRIMARY KEY,
  budget_id                 INTEGER NOT NULL REFERENCES budgets_campagne(id) ON DELETE CASCADE UNIQUE,
  tonnage_previsionnel_kg   NUMERIC(14,2),
  prix_achat_moyen_fcfa     NUMERIC(10,2),
  prix_vente_moyen_fcfa     NUMERIC(10,2),
  nb_membres_actifs         INTEGER,
  nb_livraisons_estimees    INTEGER,
  marge_brute_estimee_fcfa  NUMERIC(16,2) GENERATED ALWAYS AS
                              ((prix_vente_moyen_fcfa - prix_achat_moyen_fcfa) * tonnage_previsionnel_kg) STORED
);

CREATE INDEX idx_lignes_budget_budget ON lignes_budget(budget_id);
CREATE INDEX idx_lignes_budget_categorie ON lignes_budget(categorie);
CREATE INDEX idx_budgets_campagne ON budgets_campagne(campagne_id);
