-- Les comptes généraux sont stockés au format SYSCOHADA à six chiffres.
-- Exemple : 601 devient 601000, 4091 devient 409100.
-- Les identifiants techniques non numériques (ex. ANOUV) sont conservés.

CREATE OR REPLACE FUNCTION normaliser_numero_compte_6(valeur text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(valeur) ~ '^[0-9]{1,6}$'
      THEN rpad(trim(valeur), 6, '0')
    ELSE trim(valeur)
  END
$$;

-- Plan comptable : les parents doivent être convertis avant les numéros afin
-- de conserver les relations hiérarchiques.
UPDATE plan_comptable
SET compte_parent = normaliser_numero_compte_6(compte_parent)
WHERE compte_parent IS NOT NULL
  AND compte_parent IS DISTINCT FROM normaliser_numero_compte_6(compte_parent);

CREATE TEMP TABLE _plan_comptes_a_normaliser ON COMMIT DROP AS
SELECT id, numero_compte AS ancien_numero,
       normaliser_numero_compte_6(numero_compte) AS nouveau_numero
FROM plan_comptable
WHERE numero_compte ~ '^[0-9]{1,5}$';

-- Libérer la contrainte d'unicité pendant la conversion, tout en gardant la
-- correspondance exacte ancien numéro -> nouveau numéro.
UPDATE plan_comptable
SET numero_compte = '__LEGACY__' || id
WHERE id IN (SELECT id FROM _plan_comptes_a_normaliser);

UPDATE plan_comptable p
SET numero_compte = m.nouveau_numero
FROM _plan_comptes_a_normaliser m
WHERE p.id = m.id;

UPDATE parametres_comptes_modules
SET compte_debit = normaliser_numero_compte_6(compte_debit),
    compte_credit = normaliser_numero_compte_6(compte_credit);

UPDATE ecritures_comptables
SET compte_debit = normaliser_numero_compte_6(compte_debit),
    compte_credit = normaliser_numero_compte_6(compte_credit);

UPDATE ecritures_en_attente
SET compte_debit_propose = normaliser_numero_compte_6(compte_debit_propose),
    compte_credit_propose = normaliser_numero_compte_6(compte_credit_propose);

UPDATE comptes_tiers
SET compte_collectif = normaliser_numero_compte_6(compte_collectif);

UPDATE charges_diverses
SET compte_debit = normaliser_numero_compte_6(compte_debit),
    compte_credit = normaliser_numero_compte_6(compte_credit);

UPDATE categories_equipements
SET compte_immobilisation = normaliser_numero_compte_6(compte_immobilisation),
    compte_amortissement = normaliser_numero_compte_6(compte_amortissement);

UPDATE livraisons
SET compte_dette_producteur = normaliser_numero_compte_6(compte_dette_producteur)
WHERE compte_dette_producteur IS NOT NULL;

UPDATE balance_sage_imports
SET compte_contrepartie = normaliser_numero_compte_6(compte_contrepartie)
WHERE compte_contrepartie IS NOT NULL;

UPDATE balance_sage_lignes
SET numero_compte = normaliser_numero_compte_6(numero_compte);

CREATE OR REPLACE FUNCTION normaliser_comptes_charges_diverses_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_debit := normaliser_numero_compte_6(NEW.compte_debit);
  NEW.compte_credit := normaliser_numero_compte_6(NEW.compte_credit);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_comptes_equipements_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_immobilisation := normaliser_numero_compte_6(NEW.compte_immobilisation);
  NEW.compte_amortissement := normaliser_numero_compte_6(NEW.compte_amortissement);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_compte_livraison_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_dette_producteur := normaliser_numero_compte_6(NEW.compte_dette_producteur);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_compte_balance_sage_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_contrepartie := normaliser_numero_compte_6(NEW.compte_contrepartie);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_ligne_balance_sage_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_compte := normaliser_numero_compte_6(NEW.numero_compte);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS charges_diverses_comptes_6_trigger ON charges_diverses;
CREATE TRIGGER charges_diverses_comptes_6_trigger
BEFORE INSERT OR UPDATE ON charges_diverses
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_charges_diverses_6();

DROP TRIGGER IF EXISTS categories_equipements_comptes_6_trigger ON categories_equipements;
CREATE TRIGGER categories_equipements_comptes_6_trigger
BEFORE INSERT OR UPDATE ON categories_equipements
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_equipements_6();

DROP TRIGGER IF EXISTS livraisons_compte_6_trigger ON livraisons;
CREATE TRIGGER livraisons_compte_6_trigger
BEFORE INSERT OR UPDATE ON livraisons
FOR EACH ROW EXECUTE FUNCTION normaliser_compte_livraison_6();

DROP TRIGGER IF EXISTS balance_sage_imports_compte_6_trigger ON balance_sage_imports;
CREATE TRIGGER balance_sage_imports_compte_6_trigger
BEFORE INSERT OR UPDATE ON balance_sage_imports
FOR EACH ROW EXECUTE FUNCTION normaliser_compte_balance_sage_6();

DROP TRIGGER IF EXISTS balance_sage_lignes_compte_6_trigger ON balance_sage_lignes;
CREATE TRIGGER balance_sage_lignes_compte_6_trigger
BEFORE INSERT OR UPDATE ON balance_sage_lignes
FOR EACH ROW EXECUTE FUNCTION normaliser_ligne_balance_sage_6();

CREATE OR REPLACE FUNCTION normaliser_comptes_plan_comptable_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_compte := normaliser_numero_compte_6(NEW.numero_compte);
  NEW.compte_parent := normaliser_numero_compte_6(NEW.compte_parent);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_comptes_parametres_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_debit := normaliser_numero_compte_6(NEW.compte_debit);
  NEW.compte_credit := normaliser_numero_compte_6(NEW.compte_credit);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_comptes_ecriture_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_debit := normaliser_numero_compte_6(NEW.compte_debit);
  NEW.compte_credit := normaliser_numero_compte_6(NEW.compte_credit);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_comptes_attente_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_debit_propose := normaliser_numero_compte_6(NEW.compte_debit_propose);
  NEW.compte_credit_propose := normaliser_numero_compte_6(NEW.compte_credit_propose);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normaliser_comptes_tiers_6()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.compte_collectif := normaliser_numero_compte_6(NEW.compte_collectif);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS plan_comptable_comptes_6_trigger ON plan_comptable;
CREATE TRIGGER plan_comptable_comptes_6_trigger
BEFORE INSERT OR UPDATE ON plan_comptable
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_plan_comptable_6();

DROP TRIGGER IF EXISTS parametres_comptes_6_trigger ON parametres_comptes_modules;
CREATE TRIGGER parametres_comptes_6_trigger
BEFORE INSERT OR UPDATE ON parametres_comptes_modules
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_parametres_6();

DROP TRIGGER IF EXISTS ecritures_comptes_6_trigger ON ecritures_comptables;
CREATE TRIGGER ecritures_comptes_6_trigger
BEFORE INSERT OR UPDATE ON ecritures_comptables
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_ecriture_6();

DROP TRIGGER IF EXISTS ecritures_attente_comptes_6_trigger ON ecritures_en_attente;
CREATE TRIGGER ecritures_attente_comptes_6_trigger
BEFORE INSERT OR UPDATE ON ecritures_en_attente
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_attente_6();

DROP TRIGGER IF EXISTS comptes_tiers_collectif_6_trigger ON comptes_tiers;
CREATE TRIGGER comptes_tiers_collectif_6_trigger
BEFORE INSERT OR UPDATE ON comptes_tiers
FOR EACH ROW EXECUTE FUNCTION normaliser_comptes_tiers_6();
