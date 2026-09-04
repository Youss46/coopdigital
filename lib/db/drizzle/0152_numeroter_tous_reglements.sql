-- Attribuer un numéro local à tous les règlements historiques qui n'en ont pas.
-- Refaire le rattachement pour couvrir les lignes créées entre les migrations.
UPDATE "paiements" p
SET "cooperative_id" = COALESCE(
  (SELECT m."cooperative_id" FROM "membres" m WHERE m."id" = p."membre_id"),
  (SELECT m."cooperative_id"
     FROM "livraisons" l
     JOIN "membres" m ON m."id" = l."membre_id"
    WHERE l."id" = p."livraison_id"),
  (SELECT f."cooperative_id"
     FROM "livraisons" l
     JOIN "fournisseurs" f ON f."id" = l."fournisseur_id"
    WHERE l."id" = p."livraison_id"),
  (SELECT b."cooperative_id" FROM "bons_carburant" b WHERE b."id" = p."bon_carburant_id"),
  (SELECT d."cooperative_id" FROM "depenses_vehicule" d WHERE d."id" = p."depense_vehicule_id"),
  (SELECT u."cooperative_id" FROM "users" u WHERE u."id" = p."initialise_par"),
  (SELECT u."cooperative_id" FROM "users" u WHERE u."id" = p."valide_par"),
  (SELECT u."cooperative_id" FROM "users" u WHERE u."id" = p."agent_saisiseur_id")
)
WHERE p."cooperative_id" IS NULL;

-- Préparer un compteur pour chaque coopérative/année concernée.
INSERT INTO "sequences_recus" ("cooperative_id", "annee", "compteur")
SELECT DISTINCT
  p."cooperative_id",
  EXTRACT(YEAR FROM p."created_at")::integer,
  0
FROM "paiements" p
WHERE p."cooperative_id" IS NOT NULL
  AND p."numero_recu" IS NULL
ON CONFLICT ("cooperative_id", "annee") DO NOTHING;

-- Numéroter les historiques dans leur ordre de création, après le dernier REC
-- déjà attribué à la coopérative pour l'année concernée.
WITH candidats AS (
  SELECT
    p."id",
    p."cooperative_id",
    EXTRACT(YEAR FROM p."created_at")::integer AS annee,
    s."compteur"
      + ROW_NUMBER() OVER (
          PARTITION BY p."cooperative_id", EXTRACT(YEAR FROM p."created_at")::integer
          ORDER BY p."created_at", p."id"
        ) AS numero
  FROM "paiements" p
  JOIN "sequences_recus" s
    ON s."cooperative_id" = p."cooperative_id"
   AND s."annee" = EXTRACT(YEAR FROM p."created_at")::integer
  WHERE p."cooperative_id" IS NOT NULL
    AND p."numero_recu" IS NULL
)
UPDATE "paiements" p
SET "numero_recu" = format(
  'REC-%s-%s',
  candidats.annee,
  lpad(candidats.numero::text, 5, '0')
)
FROM candidats
WHERE p."id" = candidats."id";

-- Synchroniser chaque compteur avec le plus grand numéro désormais enregistré.
UPDATE "sequences_recus" s
SET "compteur" = GREATEST(
  s."compteur",
  COALESCE((
    SELECT MAX(substring(p."numero_recu" from '^REC-[0-9]{4}-([0-9]+)$')::integer)
    FROM "paiements" p
    WHERE p."cooperative_id" = s."cooperative_id"
      AND p."numero_recu" LIKE ('REC-' || s."annee"::text || '-%')
      AND p."numero_recu" ~ '^REC-[0-9]{4}-[0-9]+$'
  ), 0)
);
