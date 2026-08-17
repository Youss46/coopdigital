-- Migration 0096 : numérotation séquentielle des livraisons par entrepôt délégué
-- Chaque entrepôt délégué dispose de son propre compteur (ex: LIV-D01-0001).
-- Les livraisons base centrale n'ont pas de numéro délégué (NULL acceptable).

ALTER TABLE entrepots_delegues
  ADD COLUMN IF NOT EXISTS dernier_numero_livraison integer NOT NULL DEFAULT 0;

ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS numero_livraison text;
