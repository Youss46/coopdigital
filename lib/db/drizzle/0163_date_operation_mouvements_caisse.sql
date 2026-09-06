-- Les mouvements de caisse doivent conserver la date comptable de l'opération,
-- indépendamment de la date de création technique.
ALTER TABLE mouvements_caisse
  ADD COLUMN IF NOT EXISTS date_operation date NOT NULL DEFAULT CURRENT_DATE;