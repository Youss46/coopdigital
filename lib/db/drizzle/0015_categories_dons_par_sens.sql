-- Insère les catégories manquantes par sens (effectue / recu) séparément.
-- Si une coopérative a des catégories "recu" mais pas "effectue", elle reçoit
-- les catégories "effectue" par défaut, et vice versa.

-- Catégories "don effectué" manquantes
INSERT INTO categories_dons (cooperative_id, libelle, sens)
SELECT c.id, cat.libelle, 'effectue'
FROM cooperatives c
CROSS JOIN (VALUES
  ('Aide sociale'),
  ('Aide funéraire'),
  ('Soutien communautaire'),
  ('Don à une école'),
  ('Don à une structure de santé'),
  ('Infrastructure locale'),
  ('Soutien agricole'),
  ('Autre don effectué')
) AS cat(libelle)
WHERE NOT EXISTS (
  SELECT 1 FROM categories_dons cd
  WHERE cd.cooperative_id = c.id AND cd.sens = 'effectue'
);

-- Catégories "don reçu" manquantes
INSERT INTO categories_dons (cooperative_id, libelle, sens)
SELECT c.id, cat.libelle, 'recu'
FROM cooperatives c
CROSS JOIN (VALUES
  ('Don en espèces'),
  ('Matériel agricole'),
  ('Intrants agricoles'),
  ('Don institutionnel / ONG'),
  ('Subvention État'),
  ('Don exportateur'),
  ('Autre don reçu')
) AS cat(libelle)
WHERE NOT EXISTS (
  SELECT 1 FROM categories_dons cd
  WHERE cd.cooperative_id = c.id AND cd.sens = 'recu'
);
