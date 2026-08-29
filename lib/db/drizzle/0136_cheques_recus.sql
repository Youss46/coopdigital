DO $$ BEGIN
  CREATE TYPE statut_cheque_recu AS ENUM ('a_deposer', 'depose', 'encaisse', 'rejete', 'annule');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cheques_recus (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  numero_cheque VARCHAR(80) NOT NULL,
  banque VARCHAR(200) NOT NULL,
  montant_fcfa INTEGER NOT NULL CHECK (montant_fcfa > 0),
  date_reception DATE NOT NULL,
  date_echeance DATE,
  statut statut_cheque_recu NOT NULL DEFAULT 'a_deposer',
  date_depot DATE,
  date_encaissement DATE,
  date_rejet DATE,
  motif_rejet TEXT,
  date_annulation DATE,
  motif_annulation TEXT,
  compte_bancaire_id INTEGER,
  mouvement_banque_id INTEGER,
  vente_exportateur_id INTEGER NOT NULL REFERENCES ventes_exportateurs(id),
  exportateur_id INTEGER NOT NULL REFERENCES exportateurs(id),
  paiement_id INTEGER REFERENCES paiements(id),
  paiement_ligne_id INTEGER REFERENCES paiement_lignes(id),
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cheques_recus_coop_numero_idx
  ON cheques_recus (cooperative_id, numero_cheque);
CREATE INDEX IF NOT EXISTS cheques_recus_vente_idx
  ON cheques_recus (vente_exportateur_id);
CREATE INDEX IF NOT EXISTS cheques_recus_statut_idx
  ON cheques_recus (cooperative_id, statut);