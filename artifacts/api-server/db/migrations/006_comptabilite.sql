-- M05 – Comptabilité OHADA
-- Migration 006 : plan comptable, écritures, exercices

CREATE TYPE type_compte      AS ENUM ('actif', 'passif', 'charge', 'produit');
CREATE TYPE source_ecriture  AS ENUM ('livraison', 'vente', 'avance', 'paiement', 'manuel');
CREATE TYPE statut_exercice  AS ENUM ('ouvert', 'cloture');

-- Plan comptable OHADA
CREATE TABLE plan_comptable (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER         NOT NULL,
  numero_compte   VARCHAR(20)     NOT NULL,
  libelle         VARCHAR(200)    NOT NULL,
  type            type_compte     NOT NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, numero_compte)
);

-- Écritures comptables (journal général)
CREATE TABLE ecritures_comptables (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER         NOT NULL,
  date_ecriture   DATE            NOT NULL,
  numero_piece    VARCHAR(50),
  libelle         VARCHAR(300)    NOT NULL,
  compte_debit    VARCHAR(20)     NOT NULL,
  compte_credit   VARCHAR(20)     NOT NULL,
  montant_fcfa    INTEGER         NOT NULL,
  source          source_ecriture NOT NULL,
  source_id       INTEGER,
  exercice        INTEGER         NOT NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Exercices comptables
CREATE TABLE exercices (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER         NOT NULL,
  annee           INTEGER         NOT NULL,
  statut          statut_exercice NOT NULL DEFAULT 'ouvert',
  date_ouverture  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  date_cloture    TIMESTAMPTZ,
  UNIQUE (cooperative_id, annee)
);

-- Index
CREATE INDEX idx_ecritures_coop      ON ecritures_comptables(cooperative_id);
CREATE INDEX idx_ecritures_exercice  ON ecritures_comptables(exercice);
CREATE INDEX idx_ecritures_date      ON ecritures_comptables(date_ecriture);
CREATE INDEX idx_ecritures_debit     ON ecritures_comptables(compte_debit);
CREATE INDEX idx_ecritures_credit    ON ecritures_comptables(compte_credit);
CREATE INDEX idx_ecritures_source    ON ecritures_comptables(source, source_id);
CREATE INDEX idx_exercices_coop      ON exercices(cooperative_id);

-- Seed : plan comptable OHADA essentiel pour coopérative cacaoyère
INSERT INTO plan_comptable (cooperative_id, numero_compte, libelle, type) VALUES
  (1, '101',  'Capital coopératif',               'passif'),
  (1, '130',  'Résultat de l''exercice',           'passif'),
  (1, '164',  'Emprunts',                          'passif'),
  (1, '401',  'Fournisseurs (producteurs)',         'passif'),
  (1, '411',  'Clients (exportateurs)',             'actif'),
  (1, '4111', 'Créances exportateurs',              'actif'),
  (1, '416',  'Créances producteurs (avances)',     'actif'),
  (1, '521',  'Banque',                             'actif'),
  (1, '571',  'Caisse',                             'actif'),
  (1, '601',  'Achats cacao – producteurs',         'charge'),
  (1, '621',  'Frais de transport',                 'charge'),
  (1, '641',  'Main d''œuvre',                      'charge'),
  (1, '661',  'Charges financières',                'charge'),
  (1, '701',  'Ventes cacao – exportateurs',        'produit')
ON CONFLICT DO NOTHING;

-- Seed : exercice courant
INSERT INTO exercices (cooperative_id, annee, statut)
  SELECT 1, EXTRACT(YEAR FROM NOW())::int, 'ouvert'
  WHERE NOT EXISTS (SELECT 1 FROM exercices WHERE cooperative_id = 1);
