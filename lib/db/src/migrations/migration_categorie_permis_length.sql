-- Migration : augmenter la longueur de categorie_permis de 10 à 50 caractères
ALTER TABLE chauffeurs
  ALTER COLUMN categorie_permis TYPE VARCHAR(50);
