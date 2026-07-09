-- Migration 0063 : rejet RT pour enquêtes
ALTER TABLE enquete_membres
  ADD COLUMN IF NOT EXISTS commentaire_rt text,
  ADD COLUMN IF NOT EXISTS date_rejet     timestamptz;

-- Le statut 'rejete' est géré applicativement (varchar non enum)
COMMENT ON COLUMN enquete_membres.statut IS 'a_faire | collecte | valide | rejete';
