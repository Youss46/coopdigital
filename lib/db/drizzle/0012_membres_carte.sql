-- Migration : colonnes carte de membre
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS carte_statut      VARCHAR(20)  NOT NULL DEFAULT 'non_emise',
  ADD COLUMN IF NOT EXISTS carte_numero      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS carte_genere_le   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carte_suspendue_le TIMESTAMPTZ;
