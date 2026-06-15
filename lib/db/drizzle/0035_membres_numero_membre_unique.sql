-- Migration 0035 : contrainte d'unicité (cooperative_id, numero_membre)
-- Garantit qu'aucune race condition ne peut créer deux membres avec le même
-- numéro dans la même coopérative.

ALTER TABLE membres
  ADD CONSTRAINT membres_cooperative_id_numero_membre_unique
  UNIQUE (cooperative_id, numero_membre);
