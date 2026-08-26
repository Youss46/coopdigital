-- Les compteurs de reçus étaient auparavant séparés par coopérative alors que
-- paiements.numero_recu est globalement UNIQUE. Une séquence commune évite les
-- collisions entre coopératives, y compris lors d'enregistrements concurrents.
CREATE SEQUENCE IF NOT EXISTS numero_recu_global_seq
  MINVALUE 1
  START WITH 1;

-- Reprendre le plus grand numéro déjà attribué avant d'utiliser la séquence.
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(numero_recu, '^REC-[0-9]{4}-([0-9]+)$'))[1]::integer),
    0
  )
  INTO max_num
  FROM paiements
  WHERE numero_recu ~ '^REC-[0-9]{4}-[0-9]+$';

  IF max_num > 0 THEN
    PERFORM setval('numero_recu_global_seq', max_num, true);
  ELSE
    PERFORM setval('numero_recu_global_seq', 1, false);
  END IF;
END $$;