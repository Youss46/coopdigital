-- Insère chaque catégorie par défaut uniquement si elle n'existe pas déjà
-- pour cette coopérative (comparaison exacte sur libelle + sens).
-- Les catégories ajoutées manuellement sont conservées intactes.

INSERT INTO categories_dons (cooperative_id, libelle, sens)
SELECT c.id, cat.libelle, cat.sens
FROM cooperatives c
CROSS JOIN (VALUES
  ('Aide sociale',                'effectue'),
  ('Aide funéraire',              'effectue'),
  ('Soutien communautaire',       'effectue'),
  ('Don à une école',             'effectue'),
  ('Don à une structure de santé','effectue'),
  ('Infrastructure locale',       'effectue'),
  ('Soutien agricole',            'effectue'),
  ('Autre don effectué',          'effectue'),
  ('Don en espèces',              'recu'),
  ('Matériel agricole',           'recu'),
  ('Intrants agricoles',          'recu'),
  ('Don institutionnel / ONG',    'recu'),
  ('Subvention État',             'recu'),
  ('Don exportateur',             'recu'),
  ('Autre don reçu',              'recu')
) AS cat(libelle, sens)
WHERE NOT EXISTS (
  SELECT 1 FROM categories_dons cd
  WHERE cd.cooperative_id = c.id
    AND cd.libelle = cat.libelle
    AND cd.sens    = cat.sens
);
