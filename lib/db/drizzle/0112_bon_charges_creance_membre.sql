-- Les charges d'un bon de réception sont payées pour le compte du membre :
-- elles créent une créance 4091, puis sont récupérées par 401 / 4091.
-- Ne modifier que les lignes restées sur les anciens comptes par défaut afin
-- de préserver une éventuelle personnalisation comptable de la coopérative.
UPDATE "parametres_comptes_modules"
SET
  "compte_debit" = '4091',
  "updated_at" = now()
WHERE "module" = 'receptions_membres_delegues'
  AND "operation" = 'frais_carburant'
  AND "compte_debit" = '6042'
  AND "compte_credit" = '521';

UPDATE "parametres_comptes_modules"
SET
  "compte_credit" = '4091',
  "updated_at" = now()
WHERE "module" = 'receptions_membres_delegues'
  AND "operation" = 'retenue_carburant'
  AND "compte_debit" = '401'
  AND "compte_credit" = '758';

UPDATE "parametres_comptes_modules"
SET
  "compte_debit" = '4091',
  "updated_at" = now()
WHERE "module" = 'receptions_membres_delegues'
  AND "operation" = 'autres_charges'
  AND "compte_debit" = '618'
  AND "compte_credit" = '521';

UPDATE "parametres_comptes_modules"
SET
  "compte_credit" = '4091',
  "updated_at" = now()
WHERE "module" = 'receptions_membres_delegues'
  AND "operation" = 'retenue_autres_charges'
  AND "compte_debit" = '401'
  AND "compte_credit" = '758';