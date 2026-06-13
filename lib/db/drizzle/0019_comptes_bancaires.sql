-- Migration : comptes bancaires (OHADA 521)

CREATE TABLE IF NOT EXISTS comptes_bancaires (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL,
  nom                     VARCHAR(200) NOT NULL,
  banque                  VARCHAR(100) NOT NULL,
  numero_compte           VARCHAR(50),
  iban                    VARCHAR(50),
  solde_actuel_fcfa       NUMERIC NOT NULL DEFAULT 0,
  solde_mini_alerte_fcfa  NUMERIC NOT NULL DEFAULT 0,
  actif                   BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mouvements_banque (
  id               SERIAL PRIMARY KEY,
  compte_id        INTEGER NOT NULL REFERENCES comptes_bancaires(id) ON DELETE CASCADE,
  cooperative_id   INTEGER NOT NULL,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  motif            VARCHAR(50) NOT NULL,
  montant_fcfa     NUMERIC NOT NULL,
  libelle          VARCHAR(300),
  reference        VARCHAR(100),
  date_operation   DATE NOT NULL,
  date_valeur      DATE,
  solde_apres_fcfa NUMERIC,
  rapproche        BOOLEAN NOT NULL DEFAULT false,
  enregistre_par   INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mouvements_banque_compte ON mouvements_banque(compte_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_banque_date   ON mouvements_banque(date_operation);
CREATE INDEX IF NOT EXISTS idx_comptes_bancaires_coop   ON comptes_bancaires(cooperative_id);
