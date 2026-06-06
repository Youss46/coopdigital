-- 041_reconciliation.sql — Module réconciliation bancaire

-- ① Relevés bancaires importés
CREATE TABLE IF NOT EXISTS releves_bancaires (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL,
  banque           VARCHAR(100),
  numero_compte    VARCHAR(50),
  periode_debut    DATE,
  periode_fin      DATE,
  solde_debut_fcfa NUMERIC DEFAULT 0,
  solde_fin_fcfa   NUMERIC DEFAULT 0,
  statut           VARCHAR(20) NOT NULL DEFAULT 'importe',
    -- 'importe' | 'en_cours' | 'reconcilie'
  importe_par      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ② Lignes du relevé
CREATE TABLE IF NOT EXISTS lignes_releve (
  id                       SERIAL PRIMARY KEY,
  releve_id                INTEGER NOT NULL
    REFERENCES releves_bancaires(id) ON DELETE CASCADE,
  date_operation           DATE NOT NULL,
  libelle_banque           VARCHAR(500) NOT NULL,
  montant_fcfa             NUMERIC NOT NULL,
  type                     VARCHAR(10) NOT NULL,
    -- 'debit' | 'credit'
  reference_banque         VARCHAR(200),
  statut_reconciliation    VARCHAR(20) NOT NULL DEFAULT 'non_reconciliee',
    -- 'non_reconciliee' | 'reconciliee' | 'a_justifier' | 'ignoree'
  ecriture_id              INTEGER
    REFERENCES ecritures_comptables(id) ON DELETE SET NULL,
  ecart_fcfa               NUMERIC NOT NULL DEFAULT 0,
  motif_ignore             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ③ Index
CREATE INDEX IF NOT EXISTS idx_releves_coop
  ON releves_bancaires(cooperative_id);

CREATE INDEX IF NOT EXISTS idx_lignes_releve_id
  ON lignes_releve(releve_id);

CREATE INDEX IF NOT EXISTS idx_lignes_statut
  ON lignes_releve(statut_reconciliation);

CREATE INDEX IF NOT EXISTS idx_lignes_ecriture
  ON lignes_releve(ecriture_id)
  WHERE ecriture_id IS NOT NULL;
