-- Migration corrective : colonnes manquantes dans config_comptable
-- Ces colonnes ont été définies dans 0005_config_comptable_modules.sql
-- mais ce fichier n'a jamais été enregistré dans le journal Drizzle.
-- Elles sont donc absentes en production, causant un crash silencieux
-- dans proposerEcriture (SELECT * FROM config_comptable échoue).

ALTER TABLE config_comptable
  ADD COLUMN IF NOT EXISTS auto_caisse          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_banque          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_subventions     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_mobile_marchand BOOLEAN NOT NULL DEFAULT FALSE;
