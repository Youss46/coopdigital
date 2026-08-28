-- Les ventes post-réception sont rattachées à l'expédition source.
ALTER TABLE ventes_exportateurs
  ADD COLUMN IF NOT EXISTS expedition_id integer;

-- Valeur persistée de la quantité réellement acceptée au port.
ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS poids_accepte_port_kg NUMERIC(12, 2);

-- Rendre immédiatement vendables les réceptions historiques déjà acceptées.
UPDATE expeditions AS e
SET poids_accepte_port_kg = GREATEST(
  COALESCE(e.poids_recu_port_kg, 0)
  - COALESCE((
    SELECT SUM(r.poids_refoule_kg)
    FROM traitements_refus AS r
    WHERE r.expedition_id = e.id
      AND r.source_type = 'reception_port'
  ), 0),
  0
)
WHERE e.poids_recu_port_kg IS NOT NULL
  AND e.poids_accepte_port_kg IS NULL;