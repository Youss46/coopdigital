-- Migration 0084 : plan de déduction flexible pour les avances membres

CREATE TYPE avance_plan_type AS ENUM ('integral', 'partiel', 'reporte');

ALTER TABLE avances
  ADD COLUMN IF NOT EXISTS plan_type         avance_plan_type NOT NULL DEFAULT 'integral',
  ADD COLUMN IF NOT EXISTS montant_partiel_fcfa INTEGER,
  ADD COLUMN IF NOT EXISTS report_date       DATE;

CREATE TABLE IF NOT EXISTS remboursements_avances_membres (
  id             SERIAL PRIMARY KEY,
  avance_id      INTEGER NOT NULL REFERENCES avances(id) ON DELETE CASCADE,
  livraison_id   INTEGER REFERENCES livraisons(id) ON DELETE SET NULL,
  montant_fcfa   INTEGER NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
