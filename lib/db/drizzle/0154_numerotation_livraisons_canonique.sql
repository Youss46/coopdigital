ALTER TABLE "livraisons"
  ADD COLUMN IF NOT EXISTS "cooperative_id" integer REFERENCES "cooperatives"("id"),
  ADD COLUMN IF NOT EXISTS "annee_numero_pesee" integer;

ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "annee_numero_pesee" integer;

UPDATE "livraisons" l
SET "cooperative_id" = COALESCE(
  (SELECT m."cooperative_id" FROM "membres" m WHERE m."id" = l."membre_id"),
  (SELECT f."cooperative_id" FROM "fournisseurs" f WHERE f."id" = l."fournisseur_id"),
  (SELECT sp."cooperative_id" FROM "sessions_pesee" sp WHERE sp."livraison_id" = l."id" LIMIT 1),
  (SELECT u."cooperative_id" FROM "users" u WHERE u."id" = l."agent_id")
)
WHERE l."cooperative_id" IS NULL;

UPDATE "livraisons"
SET "annee_numero_pesee" = EXTRACT(YEAR FROM "date_livraison")::integer
WHERE "annee_numero_pesee" IS NULL;

UPDATE "sessions_pesee"
SET "annee_numero_pesee" = COALESCE(
  NULLIF(substring("numero_session" from '^[A-Z-]+-([0-9]{4})-'), '')::integer,
  EXTRACT(YEAR FROM "date_debut")::integer
)
WHERE "annee_numero_pesee" IS NULL;

UPDATE "livraisons" l
SET
  "numero_pesee" = COALESCE(l."numero_pesee", sp."numero_pesee"),
  "annee_numero_pesee" = COALESCE(l."annee_numero_pesee", sp."annee_numero_pesee"),
  "cooperative_id" = COALESCE(l."cooperative_id", sp."cooperative_id")
FROM "sessions_pesee" sp
WHERE sp."livraison_id" = l."id";

-- Libérer les doublons historiques avant de numéroter les lignes concernées.
WITH doublons AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY cooperative_id, annee_numero_pesee, numero_pesee
    ORDER BY created_at, id
  ) AS rang
  FROM livraisons
  WHERE cooperative_id IS NOT NULL
    AND annee_numero_pesee IS NOT NULL
    AND numero_pesee IS NOT NULL
)
UPDATE livraisons l
SET numero_pesee = NULL
FROM doublons d
WHERE l.id = d.id AND d.rang > 1;

INSERT INTO "sequences_pesee" ("cooperative_id", "annee", "compteur")
SELECT cooperative_id, annee_numero_pesee, MAX(numero_pesee)
FROM (
  SELECT cooperative_id, annee_numero_pesee, numero_pesee FROM livraisons
  UNION ALL
  SELECT cooperative_id, annee_numero_pesee, numero_pesee FROM sessions_pesee
) numeros
WHERE cooperative_id IS NOT NULL AND annee_numero_pesee IS NOT NULL AND numero_pesee IS NOT NULL
GROUP BY cooperative_id, annee_numero_pesee
ON CONFLICT ("cooperative_id", "annee")
DO UPDATE SET "compteur" = GREATEST("sequences_pesee"."compteur", EXCLUDED."compteur");

INSERT INTO "sequences_pesee" ("cooperative_id", "annee", "compteur")
SELECT DISTINCT cooperative_id, annee_numero_pesee, 0
FROM livraisons
WHERE cooperative_id IS NOT NULL AND annee_numero_pesee IS NOT NULL
ON CONFLICT ("cooperative_id", "annee") DO NOTHING;

WITH a_numeroter AS (
  SELECT
    l.id,
    s.compteur + ROW_NUMBER() OVER (
      PARTITION BY l.cooperative_id, l.annee_numero_pesee
      ORDER BY l.date_livraison, l.created_at, l.id
    ) AS nouveau_numero
  FROM livraisons l
  JOIN sequences_pesee s
    ON s.cooperative_id = l.cooperative_id
   AND s.annee = l.annee_numero_pesee
  WHERE l.numero_pesee IS NULL
    AND l.cooperative_id IS NOT NULL
    AND l.annee_numero_pesee IS NOT NULL
)
UPDATE livraisons l
SET numero_pesee = a.nouveau_numero
FROM a_numeroter a
WHERE l.id = a.id;

UPDATE sequences_pesee s
SET compteur = GREATEST(s.compteur, COALESCE((
  SELECT MAX(l.numero_pesee)
  FROM livraisons l
  WHERE l.cooperative_id = s.cooperative_id
    AND l.annee_numero_pesee = s.annee
), 0));

ALTER TABLE "livraisons"
  ADD CONSTRAINT "livraisons_cooperative_annee_numero_pesee_unique"
  UNIQUE ("cooperative_id", "annee_numero_pesee", "numero_pesee"),
  ADD CONSTRAINT "livraisons_numero_pesee_complet_check"
  CHECK ("cooperative_id" IS NULL OR ("annee_numero_pesee" IS NOT NULL AND "numero_pesee" IS NOT NULL));
