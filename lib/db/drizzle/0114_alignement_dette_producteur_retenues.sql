-- Une retenue doit débiter le même compte fournisseur que celui crédité par
-- l'achat cacao. Un 401x indépendant laisserait la dette initiale ouverte.
UPDATE "parametres_comptes_modules" AS retenue
SET
  "compte_debit" = COALESCE(
    (
      SELECT achat."compte_credit"
      FROM "parametres_comptes_modules" AS achat
      WHERE achat."cooperative_id" = retenue."cooperative_id"
        AND achat."module" = 'livraisons'
        AND achat."operation" = 'achat_cacao_producteur'
        AND achat."actif" = true
      LIMIT 1
    ),
    '401'
  ),
  "updated_at" = now()
WHERE retenue."module" = 'receptions_membres_delegues'
  AND retenue."operation" IN ('retenue_carburant', 'retenue_autres_charges');