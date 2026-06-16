-- Migration : ajout du SMIG dans config_paie
ALTER TABLE config_paie
  ADD COLUMN IF NOT EXISTS smig_fcfa INTEGER NOT NULL DEFAULT 75000;
