-- Correction : le compte racine 31 correspond au compte 311000.
-- Les anciennes valeurs 310000 provenaient de la première normalisation.

CREATE OR REPLACE FUNCTION normaliser_numero_compte_6(valeur text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(valeur) IN ('31', '310000') THEN '311000'
    WHEN trim(valeur) ~ '^[0-9]{1,6}$'
      THEN rpad(trim(valeur), 6, '0')
    ELSE trim(valeur)
  END
$$;

UPDATE plan_comptable
SET compte_parent = '311000'
WHERE compte_parent IN ('31', '310000');

-- Plusieurs anciennes normalisations peuvent avoir créé les deux lignes
-- 310000 et 311000 pour une même coopérative. La ligne 311000 est la
-- référence canonique lorsqu'elle existe déjà; sinon on conserve la première
-- ligne historique et on la renomme. Les références de comptes sont textuelles
-- dans les autres tables, il n'y a donc pas de clé plan_comptable à réécrire.
CREATE TEMP TABLE _plan_comptable_31_canonique ON COMMIT DROP AS
SELECT
  cooperative_id,
  COALESCE(
    MIN(id) FILTER (WHERE numero_compte = '311000'),
    MIN(id)
  ) AS id_canonique
FROM plan_comptable
WHERE numero_compte IN ('31', '310000', '311000')
GROUP BY cooperative_id;

DELETE FROM plan_comptable doublon
USING _plan_comptable_31_canonique canonique
WHERE doublon.cooperative_id = canonique.cooperative_id
  AND doublon.id <> canonique.id_canonique
  AND doublon.numero_compte IN ('31', '310000', '311000');

UPDATE plan_comptable compte
SET numero_compte = '311000'
FROM _plan_comptable_31_canonique canonique
WHERE compte.id = canonique.id_canonique
  AND compte.numero_compte <> '311000';

UPDATE parametres_comptes_modules
SET compte_debit = '311000'
WHERE compte_debit IN ('31', '310000');

UPDATE parametres_comptes_modules
SET compte_credit = '311000'
WHERE compte_credit IN ('31', '310000');

UPDATE ecritures_comptables
SET compte_debit = '311000'
WHERE compte_debit IN ('31', '310000');

UPDATE ecritures_comptables
SET compte_credit = '311000'
WHERE compte_credit IN ('31', '310000');

UPDATE ecritures_en_attente
SET compte_debit_propose = '311000'
WHERE compte_debit_propose IN ('31', '310000');

UPDATE ecritures_en_attente
SET compte_credit_propose = '311000'
WHERE compte_credit_propose IN ('31', '310000');

UPDATE charges_diverses
SET compte_debit = '311000'
WHERE compte_debit IN ('31', '310000');

UPDATE charges_diverses
SET compte_credit = '311000'
WHERE compte_credit IN ('31', '310000');

UPDATE categories_equipements
SET compte_immobilisation = '311000'
WHERE compte_immobilisation IN ('31', '310000');

UPDATE categories_equipements
SET compte_amortissement = '311000'
WHERE compte_amortissement IN ('31', '310000');

UPDATE livraisons
SET compte_dette_producteur = '311000'
WHERE compte_dette_producteur IN ('31', '310000');

UPDATE balance_sage_imports
SET compte_contrepartie = '311000'
WHERE compte_contrepartie IN ('31', '310000');

UPDATE balance_sage_lignes
SET numero_compte = '311000'
WHERE numero_compte IN ('31', '310000');

UPDATE comptes_tiers
SET compte_collectif = '311000'
WHERE compte_collectif IN ('31', '310000');