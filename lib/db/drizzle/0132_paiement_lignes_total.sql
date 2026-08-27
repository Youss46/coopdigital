-- Un règlement ventilé est indivisible : au commit, ses lignes doivent
-- représenter exactement le montant du paiement parent.
CREATE OR REPLACE FUNCTION verifier_total_paiement_lignes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paiement_id_concerne INTEGER;
  montant_paiement INTEGER;
  montant_lignes INTEGER;
BEGIN
  paiement_id_concerne := COALESCE(NEW.paiement_id, OLD.paiement_id);

  SELECT montant_fcfa
    INTO montant_paiement
    FROM paiements
   WHERE id = paiement_id_concerne;

  -- Le paiement peut être supprimé avant l'exécution du trigger différé
  -- (ON DELETE CASCADE). Dans ce cas il n'y a plus rien à contrôler.
  IF montant_paiement IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(montant_fcfa), 0)
    INTO montant_lignes
    FROM paiement_lignes
   WHERE paiement_id = paiement_id_concerne;

  IF montant_lignes <> montant_paiement THEN
    RAISE EXCEPTION
      'Le total des lignes du paiement % (% FCFA) doit être égal au montant du paiement (% FCFA)',
      paiement_id_concerne, montant_lignes, montant_paiement;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER paiement_lignes_total_consistent
AFTER INSERT OR UPDATE OR DELETE ON paiement_lignes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verifier_total_paiement_lignes();

ALTER TABLE paiement_lignes
  ADD CONSTRAINT paiement_lignes_montant_positif CHECK (montant_fcfa > 0);

CREATE OR REPLACE FUNCTION verifier_montant_paiement_lignes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  montant_lignes INTEGER;
BEGIN
  SELECT COALESCE(SUM(montant_fcfa), 0)
    INTO montant_lignes
    FROM paiement_lignes
   WHERE paiement_id = NEW.id;

  IF montant_lignes <> 0 AND montant_lignes <> NEW.montant_fcfa THEN
    RAISE EXCEPTION
      'Le montant du paiement % (% FCFA) ne correspond pas au total de ses lignes (% FCFA)',
      NEW.id, NEW.montant_fcfa, montant_lignes;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER paiement_montant_lignes_consistent
AFTER UPDATE OF montant_fcfa ON paiements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verifier_montant_paiement_lignes();