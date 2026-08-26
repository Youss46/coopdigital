-- Numérotation des pesées indépendante des séquences globales des identifiants
-- techniques. Les numéros sont propres à chaque coopérative et à l'année.
CREATE TABLE IF NOT EXISTS "sequences_pesee" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id") ON DELETE CASCADE,
  "annee" integer NOT NULL,
  "compteur" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "sequences_pesee_cooperative_annee_unique"
  ON "sequences_pesee" ("cooperative_id", "annee");

ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "numero_pesee" integer;

ALTER TABLE "livraisons"
  ADD COLUMN IF NOT EXISTS "numero_pesee" integer;

-- Reprendre les numéros de session déjà attribués afin que les nouvelles
-- séquences ne recouvrent pas l'historique de la coopérative.
INSERT INTO "sequences_pesee" ("cooperative_id", "annee", "compteur")
SELECT
  sp."cooperative_id",
  EXTRACT(YEAR FROM sp."created_at")::integer,
  MAX((regexp_match(sp."numero_session", '^PSE-[0-9]{4}-([0-9]+)$'))[1]::integer)
FROM "sessions_pesee" sp
WHERE sp."numero_session" ~ '^PSE-[0-9]{4}-[0-9]+$'
GROUP BY sp."cooperative_id", EXTRACT(YEAR FROM sp."created_at")
ON CONFLICT ("cooperative_id", "annee") DO UPDATE
SET "compteur" = GREATEST("sequences_pesee"."compteur", EXCLUDED."compteur");

UPDATE "sessions_pesee"
SET "numero_pesee" = (regexp_match("numero_session", '^PSE-[0-9]{4}-([0-9]+)$'))[1]::integer
WHERE "numero_pesee" IS NULL
  AND "numero_session" ~ '^PSE-[0-9]{4}-[0-9]+$';