-- Migration : scission de completude_fiche en 2 groupes (identité + EUDR)

ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS completude_identite INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completude_eudr INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statut_eudr VARCHAR(20) DEFAULT 'non_conforme',
  ADD COLUMN IF NOT EXISTS mission_gps_requise BOOLEAN DEFAULT false;

-- Groupe A (10 champs) — identité pour activation
UPDATE membres SET completude_identite = (
  (CASE WHEN nom IS NOT NULL AND nom <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN prenoms IS NOT NULL AND prenoms <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN telephone IS NOT NULL AND telephone <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN village IS NOT NULL AND village <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN date_naissance IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN sexe IS NOT NULL AND sexe <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN numero_cni IS NOT NULL AND numero_cni <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN date_adhesion IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN type_fournisseur IS NOT NULL AND type_fournisseur <> '' THEN 1 ELSE 0 END) +
  (CASE WHEN nbre_parts_souscrites > 0 THEN 1 ELSE 0 END)
) * 100 / 10;

-- Groupe B (3 champs) — données terrain EUDR
UPDATE membres SET completude_eudr = (
  (CASE WHEN gps_parcelles IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN superficie_totale IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN nombre_parcelles IS NOT NULL THEN 1 ELSE 0 END)
) * 100 / 3;

-- statut_eudr : conforme si groupe B = 100%
UPDATE membres SET statut_eudr = 'conforme' WHERE completude_eudr = 100;

-- mission_gps_requise : membres actifs sans groupe B complet
UPDATE membres
  SET mission_gps_requise = true
  WHERE statut_membre = 'actif' AND completude_eudr < 100;
