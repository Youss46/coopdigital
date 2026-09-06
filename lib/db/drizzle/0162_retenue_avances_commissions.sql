-- La retenue d'avance d'une commission doit être persistée avec la commission.
-- IF NOT EXISTS garde la migration compatible avec les bases déjà préparées
-- hors du journal Drizzle.
ALTER TABLE commissions_membres_delegues
  ADD COLUMN IF NOT EXISTS retenue_avances_fcfa integer NOT NULL DEFAULT 0;