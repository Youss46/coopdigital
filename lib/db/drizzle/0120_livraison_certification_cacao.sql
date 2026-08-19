-- La certification est une caractéristique du lot effectivement livré.
-- La conserver sur la livraison évite de dépendre du lien technique vers la
-- session de pesée pour les statistiques et les historiques.
ALTER TABLE "livraisons"
  ADD COLUMN IF NOT EXISTS "certification_cacao" text;

-- Reprendre les livraisons historiques déjà reliées à une session de pesée.
UPDATE "livraisons" AS l
SET "certification_cacao" = sp."certification_cacao"
FROM "sessions_pesee" AS sp
WHERE sp."livraison_id" = l."id"
  AND l."certification_cacao" IS NULL
  AND sp."certification_cacao" IS NOT NULL
  AND sp."certification_cacao" <> '';