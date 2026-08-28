-- Les nouveaux bons sont plafonnés par un montant autorisé.
-- Le montant reste nullable afin de conserver les bons historiques exprimés
-- uniquement en litres.
ALTER TABLE bons_carburant
  ADD COLUMN IF NOT EXISTS montant_autorise_fcfa NUMERIC(14, 2);

ALTER TABLE bons_carburant
  ALTER COLUMN quantite_autorisee DROP NOT NULL;