-- Les reçus sont désormais séquentiels dans chaque coopérative et chaque année.
ALTER TABLE "paiements"
  ADD COLUMN IF NOT EXISTS "cooperative_id" integer
    REFERENCES "cooperatives"("id");

-- Rattacher les paiements existants à leur coopérative quand la relation est connue.
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
  (SELECT u."cooperative_id" FROM "users" u WHERE u."id" = p."valide_par")
)
WHERE p."cooperative_id" IS NULL;

ALTER TABLE "paiements"
  DROP CONSTRAINT IF EXISTS "paiements_numero_recu_unique";

ALTER TABLE "paiements"
  ADD CONSTRAINT "paiements_cooperative_numero_recu_unique"
  UNIQUE ("cooperative_id", "numero_recu");

CREATE TABLE IF NOT EXISTS "sequences_recus" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id") ON DELETE CASCADE,
  "annee" integer NOT NULL,
  "compteur" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "sequences_recus_cooperative_annee_unique" UNIQUE("cooperative_id", "annee")
);

-- Continuer après les numéros REC déjà attribués à chaque coopérative.
INSERT INTO "sequences_recus" ("cooperative_id", "annee", "compteur")
SELECT
  p."cooperative_id",
  substring(p."numero_recu" from '^REC-([0-9]{4})-')::integer,
  MAX(substring(p."numero_recu" from '^REC-[0-9]{4}-([0-9]+)$')::integer)
FROM "paiements" p
WHERE p."cooperative_id" IS NOT NULL
  AND p."numero_recu" ~ '^REC-[0-9]{4}-[0-9]+$'
GROUP BY p."cooperative_id", substring(p."numero_recu" from '^REC-([0-9]{4})-')::integer
ON CONFLICT ("cooperative_id", "annee")
DO UPDATE SET "compteur" = GREATEST("sequences_recus"."compteur", EXCLUDED."compteur");