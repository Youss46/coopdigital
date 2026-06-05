-- ============================================================
-- Module Emprunts — Migration 013
-- ============================================================

CREATE TYPE preteur_type AS ENUM ('banque', 'microfinance', 'bailleur', 'prive');
CREATE TYPE emprunt_periodicite AS ENUM ('mensuel', 'trimestriel', 'semestriel', 'annuel', 'in_fine');
CREATE TYPE emprunt_statut AS ENUM ('en_cours', 'rembourse', 'en_retard', 'restructure');
CREATE TYPE echeance_statut AS ENUM ('a_payer', 'paye', 'en_retard');

CREATE TABLE preteurs (
  id                SERIAL PRIMARY KEY,
  cooperative_id    INTEGER NOT NULL REFERENCES cooperatives(id),
  type              preteur_type NOT NULL DEFAULT 'banque',
  nom               VARCHAR(200) NOT NULL,
  contact           VARCHAR(200),
  ville             VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE emprunts (
  id                        SERIAL PRIMARY KEY,
  cooperative_id            INTEGER NOT NULL REFERENCES cooperatives(id),
  preteur_id                INTEGER NOT NULL REFERENCES preteurs(id),
  libelle                   VARCHAR(300) NOT NULL,
  montant_fcfa              NUMERIC(16,2) NOT NULL,
  taux_interet_annuel_pct   NUMERIC(7,4) NOT NULL,
  duree_mois                INTEGER NOT NULL,
  date_debut                DATE NOT NULL,
  date_echeance             DATE NOT NULL,
  periodicite               emprunt_periodicite NOT NULL DEFAULT 'mensuel',
  montant_rembourse_fcfa    NUMERIC(16,2) NOT NULL DEFAULT 0,
  solde_restant_fcfa        NUMERIC(16,2) NOT NULL,
  statut                    emprunt_statut NOT NULL DEFAULT 'en_cours',
  objet                     VARCHAR(300),
  garantie                  VARCHAR(300),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE echeancier_emprunts (
  id                    SERIAL PRIMARY KEY,
  emprunt_id            INTEGER NOT NULL REFERENCES emprunts(id) ON DELETE CASCADE,
  numero_echeance       INTEGER NOT NULL,
  date_echeance         DATE NOT NULL,
  capital_fcfa          NUMERIC(16,2) NOT NULL,
  interet_fcfa          NUMERIC(16,2) NOT NULL,
  total_echeance_fcfa   NUMERIC(16,2) NOT NULL,
  statut                echeance_statut NOT NULL DEFAULT 'a_payer',
  date_paiement         DATE,
  reference_paiement    VARCHAR(100),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE remboursements_emprunts (
  id                      SERIAL PRIMARY KEY,
  emprunt_id              INTEGER NOT NULL REFERENCES emprunts(id),
  echeance_id             INTEGER REFERENCES echeancier_emprunts(id),
  date_remboursement      DATE NOT NULL,
  montant_capital_fcfa    NUMERIC(16,2) NOT NULL DEFAULT 0,
  montant_interet_fcfa    NUMERIC(16,2) NOT NULL DEFAULT 0,
  montant_total_fcfa      NUMERIC(16,2) NOT NULL,
  mode_paiement           VARCHAR(100),
  reference               VARCHAR(100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_emprunts_cooperative ON emprunts(cooperative_id);
CREATE INDEX idx_emprunts_statut ON emprunts(statut);
CREATE INDEX idx_echeancier_emprunt ON echeancier_emprunts(emprunt_id);
CREATE INDEX idx_echeancier_date ON echeancier_emprunts(date_echeance);
CREATE INDEX idx_echeancier_statut ON echeancier_emprunts(statut);

-- Seed: 2 prêteurs de test
INSERT INTO preteurs (cooperative_id, type, nom, contact, ville) VALUES
  (1, 'banque', 'SGBCI', '+225 27 20 30 00 00', 'Abidjan'),
  (1, 'microfinance', 'COOPEC Yamoussoukro', '+225 27 30 64 00 00', 'Yamoussoukro');
