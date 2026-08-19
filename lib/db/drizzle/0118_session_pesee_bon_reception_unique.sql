-- La colonne était utilisée par le schéma et les flux de réception, mais
-- n'était pas créée par une migration antérieure.
ALTER TABLE "sessions_pesee"
  ADD COLUMN IF NOT EXISTS "bon_reception_id" integer
  REFERENCES "bons_reception_membres_delegues"("id");

-- Conserver la session autoritaire des rares doublons historiques : celle déjà
-- liée au bon est prioritaire, sinon la plus ancienne. Les autres sessions
-- encore ouvertes sont annulées et dissociées pour éviter toute seconde
-- livraison, tout en préservant les données historiques pour audit.
WITH ranked AS (
  SELECT
    session.id,
    session.bon_reception_id,
    row_number() OVER (
      PARTITION BY session.bon_reception_id
      ORDER BY
        CASE WHEN session.id = bon.session_pesee_id THEN 0 ELSE 1 END,
        session.created_at,
        session.id
    ) AS rang
  FROM "sessions_pesee" AS session
  LEFT JOIN "bons_reception_membres_delegues" AS bon
    ON bon.id = session.bon_reception_id
  WHERE session.bon_reception_id IS NOT NULL
)
UPDATE "bons_reception_membres_delegues" AS bon
SET session_pesee_id = ranked.id,
    updated_at = now()
FROM ranked
WHERE bon.id = ranked.bon_reception_id
  AND ranked.rang = 1
  AND bon.session_pesee_id IS DISTINCT FROM ranked.id;

WITH ranked AS (
  SELECT
    session.id,
    row_number() OVER (
      PARTITION BY session.bon_reception_id
      ORDER BY
        CASE WHEN session.id = bon.session_pesee_id THEN 0 ELSE 1 END,
        session.created_at,
        session.id
    ) AS rang
  FROM "sessions_pesee" AS session
  LEFT JOIN "bons_reception_membres_delegues" AS bon
    ON bon.id = session.bon_reception_id
  WHERE session.bon_reception_id IS NOT NULL
)
UPDATE "sessions_pesee" AS session
SET bon_reception_id = NULL,
    statut = CASE WHEN session.statut = 'en_cours' THEN 'annulee' ELSE session.statut END,
    date_fin = CASE WHEN session.statut = 'en_cours' THEN now() ELSE session.date_fin END,
    notes = concat_ws(E'\n', session.notes, '[Session dissociée lors de la réparation d''un doublon de bon]')
FROM ranked
WHERE session.id = ranked.id
  AND ranked.rang > 1;

-- Un bon de réception ne peut jamais déclencher deux sessions de pesée.
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_pesee_bon_reception_unique"
  ON "sessions_pesee" ("bon_reception_id")
  WHERE "bon_reception_id" IS NOT NULL;