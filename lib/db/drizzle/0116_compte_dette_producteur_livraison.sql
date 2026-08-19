-- Fige le compte fournisseur réellement crédité à la livraison afin que le
-- paiement différé le solde même si le paramétrage comptable change ensuite.
ALTER TABLE "livraisons"
  ADD COLUMN IF NOT EXISTS "compte_dette_producteur" text;

-- Reconstituer le compte des livraisons historiques depuis leur écriture
-- comptabilisée ou, en mode manuel, depuis leur proposition d'écriture.
UPDATE "livraisons" AS livraison
SET "compte_dette_producteur" = COALESCE(
  (
    SELECT ecriture."compte_credit"
    FROM "ecritures_comptables" AS ecriture
    WHERE ecriture."source" = 'livraison'
      AND ecriture."source_id" = livraison."id"
      AND ecriture."type_ecriture" = 'normale'
      AND ecriture."libelle" LIKE 'Achat cacao –%'
    ORDER BY ecriture."id"
    LIMIT 1
  ),
  (
    SELECT attente."compte_credit_propose"
    FROM "ecritures_en_attente" AS attente
    WHERE attente."source" = 'livraison'
      AND attente."source_id" = livraison."id"
      AND attente."statut" <> 'rejetee'
      AND attente."libelle_propose" LIKE 'Achat cacao –%'
    ORDER BY attente."id"
    LIMIT 1
  ),
  '401'
)
WHERE livraison."compte_dette_producteur" IS NULL;