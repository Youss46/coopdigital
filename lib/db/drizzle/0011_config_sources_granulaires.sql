-- Migration : colonnes granulaires dans config_comptable
-- Permet de configurer auto/manuel indépendamment pour chaque module

ALTER TABLE config_comptable
  ADD COLUMN IF NOT EXISTS auto_emprunts        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_transport        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_investissements  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_maintenances     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_intrants         BOOLEAN NOT NULL DEFAULT FALSE;
