-- 040_fiscalite.sql — Module fiscalité

-- ① Obligations fiscales
CREATE TABLE IF NOT EXISTS obligations_fiscales (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL,
  type_taxe        VARCHAR(30) NOT NULL,
  libelle          VARCHAR(200) NOT NULL,
  base_calcul      TEXT,
  taux_pct         NUMERIC,
  periodicite      VARCHAR(20) NOT NULL DEFAULT 'mensuel',
  jour_echeance    INTEGER,
  actif            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ② Déclarations fiscales
CREATE TABLE IF NOT EXISTS declarations_fiscales (
  id                    SERIAL PRIMARY KEY,
  cooperative_id        INTEGER NOT NULL,
  obligation_id         INTEGER NOT NULL REFERENCES obligations_fiscales(id),
  periode               VARCHAR(50) NOT NULL,
  base_imposable_fcfa   NUMERIC,
  montant_calcule_fcfa  NUMERIC NOT NULL DEFAULT 0,
  montant_paye_fcfa     NUMERIC NOT NULL DEFAULT 0,
  date_echeance         DATE,
  date_paiement         DATE,
  reference_paiement    VARCHAR(100),
  statut                VARCHAR(20) NOT NULL DEFAULT 'a_payer',
  penalite_retard_fcfa  NUMERIC NOT NULL DEFAULT 0,
  document_url          VARCHAR(500),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_declarations_statut   ON declarations_fiscales(cooperative_id, statut);
CREATE INDEX IF NOT EXISTS idx_declarations_echeance ON declarations_fiscales(date_echeance);
CREATE INDEX IF NOT EXISTS idx_declarations_oblig    ON declarations_fiscales(obligation_id);

-- ③ Seed obligations ivoiriennes (cooperative_id = 1)
INSERT INTO obligations_fiscales (cooperative_id, type_taxe, libelle, base_calcul, taux_pct, periodicite, jour_echeance)
VALUES
  (1, 'cnps',               'CNPS salariale',         'Salaire brut total x 3.2%',   3.2,  'mensuel',     15),
  (1, 'cnps',               'CNPS patronale',         'Salaire brut total x 7.7%',   7.7,  'mensuel',     15),
  (1, 'its',                'ITS (Impôt sur Salaires)','Barème progressif par salarié', NULL, 'mensuel',   15),
  (1, 'taxe_apprentissage', 'Taxe d''apprentissage',  'Salaire brut total x 0.5%',   0.5,  'annuel',      31),
  (1, 'fpc',                'FPC (Formation professionnelle)', 'Salaire brut total x 1.2%', 1.2, 'annuel', 31),
  (1, 'impot_societes',     'Impôt sur les Sociétés', 'Bénéfice net imposable',       25.0, 'annuel',      30)
ON CONFLICT DO NOTHING;
