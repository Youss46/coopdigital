-- 039_caisse.sql — Module gestion de caisse

-- ① Caisses
CREATE TABLE IF NOT EXISTS caisses (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL,
  nom                     VARCHAR(200) NOT NULL,
  responsable_id          INTEGER REFERENCES users(id),
  solde_actuel_fcfa       NUMERIC NOT NULL DEFAULT 0,
  fond_caisse_minimum_fcfa NUMERIC NOT NULL DEFAULT 0,
  actif                   BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ② Sessions de caisse (journal journalier)
CREATE TABLE IF NOT EXISTS sessions_caisse (
  id                            SERIAL PRIMARY KEY,
  caisse_id                     INTEGER NOT NULL REFERENCES caisses(id),
  cooperative_id                INTEGER NOT NULL,
  date_session                  DATE NOT NULL,
  ouvert_par                    INTEGER REFERENCES users(id),
  solde_ouverture_fcfa          NUMERIC NOT NULL DEFAULT 0,
  solde_fermeture_theorique_fcfa NUMERIC,
  solde_fermeture_reel_fcfa     NUMERIC,
  ecart_fcfa                    NUMERIC GENERATED ALWAYS AS (
                                  solde_fermeture_reel_fcfa - solde_fermeture_theorique_fcfa
                                ) STORED,
  statut                        VARCHAR(20) NOT NULL DEFAULT 'ouverte',
  ferme_par                     INTEGER REFERENCES users(id),
  heure_ouverture               TIMESTAMP WITH TIME ZONE DEFAULT now(),
  heure_fermeture               TIMESTAMP WITH TIME ZONE,
  observations                  TEXT,
  created_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ③ Mouvements de caisse
CREATE TABLE IF NOT EXISTS mouvements_caisse (
  id                    SERIAL PRIMARY KEY,
  caisse_id             INTEGER NOT NULL REFERENCES caisses(id),
  session_id            INTEGER NOT NULL REFERENCES sessions_caisse(id),
  cooperative_id        INTEGER NOT NULL,
  type                  VARCHAR(10) NOT NULL,  -- 'entree' | 'sortie'
  motif                 VARCHAR(50) NOT NULL,
  montant_fcfa          NUMERIC NOT NULL,
  libelle               VARCHAR(300),
  reference_operation   VARCHAR(100),
  solde_apres_fcfa      NUMERIC,
  enregistre_par        INTEGER REFERENCES users(id),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_caisse    ON sessions_caisse(caisse_id, date_session);
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_statut    ON sessions_caisse(statut);
CREATE INDEX IF NOT EXISTS idx_mouvements_session        ON mouvements_caisse(session_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_caisse_date    ON mouvements_caisse(caisse_id, created_at);
