UPDATE livraisons l
SET cooperative_id = p.cooperative_id
FROM paiements p
WHERE p.livraison_id = l.id
  AND l.cooperative_id IS NULL
  AND p.cooperative_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM livraisons
    WHERE cooperative_id IS NULL
       OR annee_numero_pesee IS NULL
       OR numero_pesee IS NULL
  ) THEN
    RAISE EXCEPTION
      'Numérotation des livraisons incomplète: rattacher les lignes historiques à une coopérative avant de poursuivre';
  END IF;
END $$;

ALTER TABLE livraisons
  ALTER COLUMN cooperative_id SET NOT NULL,
  ALTER COLUMN annee_numero_pesee SET NOT NULL,
  ALTER COLUMN numero_pesee SET NOT NULL;

ALTER TABLE livraisons
  DROP CONSTRAINT IF EXISTS livraisons_numero_pesee_complet_check,
  ADD CONSTRAINT livraisons_numero_pesee_complet_check
    CHECK (annee_numero_pesee IS NOT NULL AND numero_pesee IS NOT NULL);