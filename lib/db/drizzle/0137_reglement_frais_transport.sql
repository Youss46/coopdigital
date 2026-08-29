ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS frais_transport_fcfa NUMERIC,
  ADD COLUMN IF NOT EXISTS frais_transport_statut VARCHAR(20) NOT NULL DEFAULT 'non_paye',
  ADD COLUMN IF NOT EXISTS frais_transport_mode_paiement VARCHAR(20),
  ADD COLUMN IF NOT EXISTS frais_transport_caisse_id INTEGER,
  ADD COLUMN IF NOT EXISTS frais_transport_compte_bancaire_id INTEGER,
  ADD COLUMN IF NOT EXISTS frais_transport_date_reglement DATE,
  ADD COLUMN IF NOT EXISTS frais_transport_reference_reglement VARCHAR(100),
  ADD COLUMN IF NOT EXISTS frais_transport_regle_par INTEGER;

UPDATE expeditions
SET frais_transport_statut = 'non_paye'
WHERE frais_transport_statut IS NULL;

ALTER TABLE expeditions
  ADD CONSTRAINT expeditions_frais_transport_statut_ck
  CHECK (frais_transport_statut IN ('non_paye', 'paye'))
  NOT VALID;

CREATE INDEX IF NOT EXISTS expeditions_frais_transport_reglement_idx
  ON expeditions (cooperative_id, frais_transport_statut)
  WHERE frais_transport_fcfa IS NOT NULL AND frais_transport_fcfa > 0;