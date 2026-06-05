-- ============================================================
-- Module Devises & Change — Migration 014
-- ============================================================

CREATE TABLE devises (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(10) NOT NULL UNIQUE,
  libelle   VARCHAR(100) NOT NULL,
  symbole   VARCHAR(10) NOT NULL,
  actif     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE taux_change (
  id                SERIAL PRIMARY KEY,
  cooperative_id    INTEGER NOT NULL REFERENCES cooperatives(id),
  devise_source     VARCHAR(10) NOT NULL,
  devise_cible      VARCHAR(10) NOT NULL DEFAULT 'XOF',
  taux              NUMERIC(18,6) NOT NULL,
  date_application  DATE NOT NULL,
  source_taux       VARCHAR(50) NOT NULL DEFAULT 'manuel',
  saisi_par         INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_taux_change_cooperative ON taux_change(cooperative_id);
CREATE INDEX idx_taux_change_devise ON taux_change(devise_source);
CREATE INDEX idx_taux_change_date ON taux_change(date_application DESC);

-- Enrichissement ventes_exportateurs
ALTER TABLE ventes_exportateurs
  ADD COLUMN IF NOT EXISTS devise_facturation         VARCHAR(10) NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS montant_devise_etrangere   NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS taux_change_applique       NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS montant_fcfa_converti      NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS gain_perte_change_fcfa     NUMERIC(16,2);

-- Seed devises
INSERT INTO devises (code, libelle, symbole) VALUES
  ('XOF', 'Franc CFA Ouest-Africain', 'FCFA'),
  ('EUR', 'Euro',                     '€'),
  ('USD', 'Dollar américain',         '$'),
  ('GBP', 'Livre sterling',           '£');

-- Seed taux initiaux (taux indicatifs BCEAO au 05/06/2026)
INSERT INTO taux_change (cooperative_id, devise_source, devise_cible, taux, date_application, source_taux) VALUES
  (1, 'EUR', 'XOF', 655.957,  '2026-06-05', 'BCEAO'),
  (1, 'USD', 'XOF', 605.320,  '2026-06-05', 'BCEAO'),
  (1, 'GBP', 'XOF', 768.450,  '2026-06-05', 'BCEAO');
