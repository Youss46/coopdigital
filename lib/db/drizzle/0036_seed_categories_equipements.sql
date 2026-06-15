-- Migration 0036 : catégories d'équipements par défaut pour toutes les coopératives
-- Insère 8 catégories standard (véhicules, matériel agricole, etc.) pour chaque
-- coopérative qui n'en a pas encore.

INSERT INTO categories_equipements (cooperative_id, libelle, duree_amortissement_ans, methode_amortissement, compte_immobilisation, compte_amortissement)
SELECT c.id, cat.libelle, cat.duree, cat.methode, cat.cpte_immo, cat.cpte_amort
FROM cooperatives c
CROSS JOIN (VALUES
  ('Véhicules et engins',        5, 'lineaire',   '2445', '2845'),
  ('Matériel agricole',          10, 'lineaire',  '2441', '2841'),
  ('Matériel informatique',      3,  'degressif', '2448', '2848'),
  ('Matériel de pesage',         7,  'lineaire',  '2443', '2843'),
  ('Matériel de bureau',         5,  'lineaire',  '2444', '2844'),
  ('Groupes électrogènes',       8,  'lineaire',  '2442', '2842'),
  ('Bâtiments et infrastructures', 20, 'lineaire','231',  '281'),
  ('Motos et deux-roues',        4,  'lineaire',  '2446', '2846')
) AS cat(libelle, duree, methode, cpte_immo, cpte_amort)
WHERE NOT EXISTS (
  SELECT 1 FROM categories_equipements ce
  WHERE ce.cooperative_id = c.id
);
