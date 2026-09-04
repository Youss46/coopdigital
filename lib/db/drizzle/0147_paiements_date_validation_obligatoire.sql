-- Les règlements déjà confirmés/effectués doivent avoir une date de validation.
-- Pour les anciennes lignes, created_at est la seule date historique fiable.
UPDATE paiements
SET date_validation = created_at
WHERE statut IN ('confirme', 'effectue')
  AND date_validation IS NULL;

ALTER TABLE paiements
  ADD CONSTRAINT paiements_confirmes_date_validation_check
  CHECK (statut NOT IN ('confirme', 'effectue') OR date_validation IS NOT NULL);