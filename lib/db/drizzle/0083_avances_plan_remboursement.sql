-- Migration 0083 : plan de remboursement flexible des avances personnel

CREATE TYPE avance_personnel_plan AS ENUM ('integral', 'mensuel', 'reporte');

ALTER TABLE avances_personnel
  ADD COLUMN IF NOT EXISTS plan_type avance_personnel_plan NOT NULL DEFAULT 'integral',
  ADD COLUMN IF NOT EXISTS montant_mensuel_fcfa INTEGER,
  ADD COLUMN IF NOT EXISTS report_mois INTEGER,
  ADD COLUMN IF NOT EXISTS report_annee INTEGER;

CREATE TABLE IF NOT EXISTS remboursements_avance (
  id              SERIAL PRIMARY KEY,
  avance_id       INTEGER NOT NULL REFERENCES avances_personnel(id) ON DELETE CASCADE,
  bulletin_id     INTEGER REFERENCES bulletins_paie(id) ON DELETE SET NULL,
  montant_fcfa    INTEGER NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
