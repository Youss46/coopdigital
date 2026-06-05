-- Module Anomalies : détection automatique d'opérations suspectes

CREATE TABLE IF NOT EXISTS anomalies (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL REFERENCES cooperatives(id),
  type_anomalie           VARCHAR(100) NOT NULL,
  niveau_gravite          VARCHAR(20)  NOT NULL CHECK (niveau_gravite IN ('info','attention','critique')),
  module_source           VARCHAR(50)  NOT NULL,
  entite_id               INTEGER,
  entite_type             VARCHAR(50),
  description             VARCHAR(500) NOT NULL,
  valeur_detectee         NUMERIC,
  seuil_configure         NUMERIC,
  agent_id                INTEGER,
  membre_id               INTEGER REFERENCES membres(id),
  statut                  VARCHAR(20)  NOT NULL DEFAULT 'nouvelle'
                            CHECK (statut IN ('nouvelle','en_cours','resolue','ignoree','faux_positif')),
  traite_par              INTEGER REFERENCES users(id),
  traite_le               TIMESTAMP WITH TIME ZONE,
  commentaire_traitement  TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS config_anomalies (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id) UNIQUE,
  -- Livraisons
  poids_max_livraison_kg      NUMERIC  DEFAULT 5000,
  poids_moyen_multiplicateur  NUMERIC  DEFAULT 3,
  delai_min_entre_livraisons_h INTEGER DEFAULT 12,
  -- Avances
  avance_max_fcfa             NUMERIC  DEFAULT 500000,
  avance_si_retard_existant   BOOLEAN  DEFAULT true,
  -- Stocks
  sortie_max_pct_stock        NUMERIC  DEFAULT 80,
  -- Paiements
  paiement_sans_livraison     BOOLEAN  DEFAULT true,
  doublon_paiement_delai_h    INTEGER  DEFAULT 24,
  -- Comptabilité
  ecriture_montant_max_fcfa   NUMERIC  DEFAULT 10000000,
  ecart_reconciliation_pct    NUMERIC  DEFAULT 1,
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

INSERT INTO config_anomalies (cooperative_id)
VALUES (1)
ON CONFLICT (cooperative_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_anomalies_coop       ON anomalies(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_statut     ON anomalies(statut);
CREATE INDEX IF NOT EXISTS idx_anomalies_gravite    ON anomalies(niveau_gravite);
CREATE INDEX IF NOT EXISTS idx_anomalies_membre     ON anomalies(membre_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_module     ON anomalies(module_source);
CREATE INDEX IF NOT EXISTS idx_anomalies_created    ON anomalies(created_at DESC);
