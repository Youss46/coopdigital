CREATE TABLE IF NOT EXISTS paiement_lignes (
  id SERIAL PRIMARY KEY,
  paiement_id INTEGER NOT NULL REFERENCES paiements(id) ON DELETE CASCADE,
  mode_paiement mode_paiement NOT NULL,
  montant_fcfa INTEGER NOT NULL CHECK (montant_fcfa > 0),
  reference_transaction TEXT,
  telephone TEXT,
  numero_cheque TEXT,
  banque TEXT,
  date_echeance DATE
);

ALTER TABLE cheques_emis
  ADD COLUMN IF NOT EXISTS paiement_ligne_id INTEGER;

CREATE INDEX IF NOT EXISTS paiement_lignes_paiement_id_idx
  ON paiement_lignes (paiement_id);

CREATE INDEX IF NOT EXISTS cheques_emis_paiement_ligne_id_idx
  ON cheques_emis (paiement_ligne_id);