-- Migration 011 : Module Intrants (M28)

CREATE TABLE IF NOT EXISTS categories_intrants (
  id                SERIAL PRIMARY KEY,
  cooperative_id    INTEGER NOT NULL REFERENCES cooperatives(id),
  libelle           VARCHAR(100) NOT NULL,
  unite             VARCHAR(30) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intrants (
  id                    SERIAL PRIMARY KEY,
  cooperative_id        INTEGER NOT NULL REFERENCES cooperatives(id),
  categorie_id          INTEGER REFERENCES categories_intrants(id),
  nom                   VARCHAR(150) NOT NULL,
  description           TEXT,
  unite                 VARCHAR(30) NOT NULL,
  prix_unitaire_fcfa    NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_actuel          NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimum         NUMERIC(12,3) NOT NULL DEFAULT 0,
  fournisseur_intrant   VARCHAR(150),
  date_peremption       DATE,
  actif                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approvisionnements_intrants (
  id                    SERIAL PRIMARY KEY,
  cooperative_id        INTEGER NOT NULL REFERENCES cooperatives(id),
  intrant_id            INTEGER NOT NULL REFERENCES intrants(id),
  campagne_id           INTEGER REFERENCES campagnes(id),
  date_appro            DATE NOT NULL,
  quantite              NUMERIC(12,3) NOT NULL,
  prix_unitaire_fcfa    NUMERIC(12,2) NOT NULL,
  montant_total_fcfa    NUMERIC(14,2) NOT NULL,
  fournisseur           VARCHAR(150),
  numero_facture        VARCHAR(100),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE distribution_mode AS ENUM ('credit', 'gratuit', 'subventionne');
CREATE TYPE remboursement_statut AS ENUM ('non_rembourse', 'partiel', 'rembourse');

CREATE TABLE IF NOT EXISTS distributions_intrants (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL REFERENCES cooperatives(id),
  intrant_id              INTEGER NOT NULL REFERENCES intrants(id),
  membre_id               INTEGER NOT NULL REFERENCES membres(id),
  campagne_id             INTEGER REFERENCES campagnes(id),
  date_distribution       DATE NOT NULL,
  quantite                NUMERIC(12,3) NOT NULL,
  prix_unitaire_fcfa      NUMERIC(12,2) NOT NULL,
  montant_fcfa            NUMERIC(14,2) NOT NULL,
  mode                    distribution_mode NOT NULL DEFAULT 'credit',
  taux_subvention_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  montant_membre_fcfa     NUMERIC(14,2) NOT NULL DEFAULT 0,
  statut_remboursement    remboursement_statut NOT NULL DEFAULT 'non_rembourse',
  montant_rembourse_fcfa  NUMERIC(14,2) NOT NULL DEFAULT 0,
  agent_id                INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE remboursement_intrant_mode AS ENUM ('deduction_livraison', 'especes', 'mobile');

CREATE TABLE IF NOT EXISTS remboursements_intrants (
  id                  SERIAL PRIMARY KEY,
  distribution_id     INTEGER NOT NULL REFERENCES distributions_intrants(id),
  membre_id           INTEGER NOT NULL REFERENCES membres(id),
  date_remboursement  DATE NOT NULL,
  montant_fcfa        NUMERIC(14,2) NOT NULL,
  mode                remboursement_intrant_mode NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_intrants_coop ON intrants(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_intrants_categorie ON intrants(categorie_id);
CREATE INDEX IF NOT EXISTS idx_distributions_membre ON distributions_intrants(membre_id);
CREATE INDEX IF NOT EXISTS idx_distributions_campagne ON distributions_intrants(campagne_id);
CREATE INDEX IF NOT EXISTS idx_distributions_statut ON distributions_intrants(statut_remboursement);
CREATE INDEX IF NOT EXISTS idx_remboursements_distribution ON remboursements_intrants(distribution_id);
CREATE INDEX IF NOT EXISTS idx_remboursements_membre ON remboursements_intrants(membre_id);

-- Données de référence (catégories de base)
INSERT INTO categories_intrants (cooperative_id, libelle, unite) VALUES
  (1, 'Engrais', 'kg'),
  (1, 'Phytosanitaire', 'litre'),
  (1, 'Outil', 'unité'),
  (1, 'Semence', 'sac')
ON CONFLICT DO NOTHING;
