-- Aligne les paramètres affichés avec le compte fournisseur qui porte
-- réellement la dette producteur. L'exécution applique également cet invariant.
UPDATE "parametres_comptes_modules" AS parametre
SET
  "compte_debit" = COALESCE(
    (
      SELECT achat."compte_credit"
      FROM "parametres_comptes_modules" AS achat
      WHERE achat."cooperative_id" = parametre."cooperative_id"
        AND achat."module" = 'livraisons'
        AND achat."operation" = 'achat_cacao_producteur'
        AND achat."actif" = true
      LIMIT 1
    ),
    '401'
  ),
  "updated_at" = now()
WHERE
  (
    parametre."module" = 'receptions_membres_delegues'
    AND parametre."operation" IN ('retenue_carburant', 'retenue_autres_charges')
  )
  OR
  (
    parametre."module" = 'livraisons'
    AND parametre."operation" IN ('paiement_producteur_banque', 'paiement_producteur_caisse')
  )
  OR
  (
    parametre."module" = 'avances'
    AND parametre."operation" = 'remboursement_avance'
  );