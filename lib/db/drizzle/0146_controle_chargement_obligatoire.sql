ALTER TABLE config_cooperative
  ADD COLUMN IF NOT EXISTS controle_chargement_obligatoire boolean NOT NULL DEFAULT false;