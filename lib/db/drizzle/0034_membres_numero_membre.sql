-- Migration 0034 : isolation multi-tenants — numero_membre par coopérative
-- Remplace l'id global comme base du code membre (MBR-AAAA-NNNN).

-- Étape 1 : ajouter la colonne nullable
ALTER TABLE membres ADD COLUMN IF NOT EXISTS numero_membre INTEGER;

-- Étape 2 : backfiller chaque membre avec son rang au sein de sa coopérative
-- (ordre par id pour préserver l'ordre d'inscription historique)
UPDATE membres m
SET numero_membre = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY cooperative_id ORDER BY id) AS rn
  FROM membres
) sub
WHERE m.id = sub.id;

-- Étape 3 : rendre la colonne NOT NULL avec défaut 1 (garde-fou pour les inserts hors-code)
ALTER TABLE membres ALTER COLUMN numero_membre SET NOT NULL;
ALTER TABLE membres ALTER COLUMN numero_membre SET DEFAULT 1;
