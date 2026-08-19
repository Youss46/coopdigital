-- Garantit la nouvelle sémantique même pour les paramètres personnalisés :
-- l'avance utilise un compte fournisseur débiteur 409x et sa récupération
-- crédite exactement ce même compte, jamais un compte de produit.
UPDATE "parametres_comptes_modules"
SET
  "compte_debit" = '4091',
  "updated_at" = now()
WHERE "module" = 'receptions_membres_delegues'
  AND "operation" IN ('frais_carburant', 'autres_charges')
  AND "compte_debit" NOT LIKE '409%';

UPDATE "parametres_comptes_modules" AS retenue
SET
  "compte_credit" = COALESCE(
    (
      SELECT avance."compte_debit"
      FROM "parametres_comptes_modules" AS avance
      WHERE avance."cooperative_id" = retenue."cooperative_id"
        AND avance."module" = retenue."module"
        AND avance."operation" = 'frais_carburant'
        AND avance."actif" = true
      LIMIT 1
    ),
    '4091'
  ),
  "updated_at" = now()
WHERE retenue."module" = 'receptions_membres_delegues'
  AND retenue."operation" = 'retenue_carburant';

UPDATE "parametres_comptes_modules" AS retenue
SET
  "compte_credit" = COALESCE(
    (
      SELECT avance."compte_debit"
      FROM "parametres_comptes_modules" AS avance
      WHERE avance."cooperative_id" = retenue."cooperative_id"
        AND avance."module" = retenue."module"
        AND avance."operation" = 'autres_charges'
        AND avance."actif" = true
      LIMIT 1
    ),
    '4091'
  ),
  "updated_at" = now()
WHERE retenue."module" = 'receptions_membres_delegues'
  AND retenue."operation" = 'retenue_autres_charges';