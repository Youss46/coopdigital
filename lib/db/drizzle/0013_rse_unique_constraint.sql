-- Ajout contrainte UNIQUE (cooperative_id, campagne_id) sur indicateurs_rse
-- Requise par l'onConflictDoUpdate du service RSE

-- Supprimer les doublons éventuels avant d'ajouter la contrainte
-- (garder la ligne la plus récente par cooperative+campagne)
DELETE FROM indicateurs_rse a
  USING indicateurs_rse b
  WHERE a.id < b.id
    AND a.cooperative_id = b.cooperative_id
    AND a.campagne_id    = b.campagne_id;

ALTER TABLE indicateurs_rse
  ADD CONSTRAINT indicateurs_rse_coop_campagne_unique
  UNIQUE (cooperative_id, campagne_id);
