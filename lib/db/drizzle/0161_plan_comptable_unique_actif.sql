-- Un seul compte actif par coopérative et numéro.
-- Les copies actives issues d'anciens imports sont conservées comme historiques
-- inactifs ; la première ligne active reste la référence.
WITH lignes_classees AS (
  SELECT
    id,
    actif,
    row_number() OVER (
      PARTITION BY cooperative_id, numero_compte
      ORDER BY actif DESC, created_at ASC, id ASC
    ) AS rang
  FROM plan_comptable
)
UPDATE plan_comptable AS compte
SET actif = false,
    updated_at = now()
FROM lignes_classees AS ligne
WHERE compte.id = ligne.id
  AND ligne.rang > 1
  AND ligne.actif = true;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_comptable_cooperative_numero_actif_unique"
  ON "plan_comptable" ("cooperative_id", "numero_compte")
  WHERE "actif" = true;