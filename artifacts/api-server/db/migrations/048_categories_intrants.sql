-- ============================================================
-- Migration 048 — Catégories d'intrants par défaut
-- À exécuter dans Railway → PostgreSQL → Query
-- Insère les catégories pour TOUTES les coopératives existantes
-- (ON CONFLICT DO NOTHING = idempotent, sans risque de doublons)
-- ============================================================

INSERT INTO categories_intrants (cooperative_id, libelle, unite)
SELECT c.id, v.libelle, v.unite
FROM cooperatives c
CROSS JOIN (VALUES
  ('Engrais',           'kg'),
  ('Pesticides',        'litre'),
  ('Fongicides',        'litre'),
  ('Herbicides',        'litre'),
  ('Semences',          'kg'),
  ('Équipements EPI',   'unité'),
  ('Matériel agricole', 'unité')
) AS v(libelle, unite)
ON CONFLICT DO NOTHING;
