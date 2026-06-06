-- 036_formations.sql
-- Module formations & renforcement de capacités

-- ① Programmes de formation
CREATE TABLE IF NOT EXISTS programmes_formation (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL,
  titre            VARCHAR(300) NOT NULL,
  description      TEXT,
  thematiques      TEXT[] DEFAULT '{}',
  financeur        VARCHAR(100),
  budget_fcfa      NUMERIC DEFAULT 0,
  date_debut       DATE,
  date_fin         DATE,
  statut           VARCHAR(20) NOT NULL DEFAULT 'planifie',
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ② Sessions de formation
CREATE TABLE IF NOT EXISTS sessions_formation (
  id                   SERIAL PRIMARY KEY,
  cooperative_id       INTEGER NOT NULL,
  programme_id         INTEGER REFERENCES programmes_formation(id),
  campagne_id          INTEGER REFERENCES campagnes(id),
  titre                VARCHAR(300) NOT NULL,
  thematique           VARCHAR(100),
  formateur            VARCHAR(200),
  organisme_formateur  VARCHAR(200),
  lieu                 VARCHAR(200),
  date_session         DATE NOT NULL,
  heure_debut          TIME,
  heure_fin            TIME,
  duree_heures         NUMERIC,
  nb_places            INTEGER,
  cout_fcfa            NUMERIC DEFAULT 0,
  statut               VARCHAR(20) NOT NULL DEFAULT 'planifie',
  support_url          VARCHAR(500),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE
);

-- ③ Inscriptions à une session
CREATE TABLE IF NOT EXISTS inscriptions_formation (
  id                      SERIAL PRIMARY KEY,
  session_id              INTEGER NOT NULL REFERENCES sessions_formation(id) ON DELETE CASCADE,
  membre_id               INTEGER NOT NULL REFERENCES membres(id),
  statut                  VARCHAR(20) NOT NULL DEFAULT 'inscrit',
  date_inscription        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sms_convocation_envoye  BOOLEAN NOT NULL DEFAULT false,
  sms_rappel_envoye       BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, membre_id)
);

-- ④ Attestations de formation
CREATE TABLE IF NOT EXISTS attestations_formation (
  id                  SERIAL PRIMARY KEY,
  session_id          INTEGER NOT NULL REFERENCES sessions_formation(id),
  membre_id           INTEGER NOT NULL REFERENCES membres(id),
  numero_attestation  VARCHAR(100) UNIQUE,
  date_emission       DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_url             VARCHAR(500),
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ⑤ Évaluations de session
CREATE TABLE IF NOT EXISTS evaluations_formation (
  id                 SERIAL PRIMARY KEY,
  session_id         INTEGER NOT NULL REFERENCES sessions_formation(id),
  membre_id          INTEGER NOT NULL REFERENCES membres(id),
  note_sur_10        INTEGER CHECK (note_sur_10 BETWEEN 0 AND 10),
  commentaire        TEXT,
  points_forts       TEXT,
  points_ameliorer   TEXT,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_sessions_coop_date   ON sessions_formation(cooperative_id, date_session);
CREATE INDEX IF NOT EXISTS idx_sessions_prog         ON sessions_formation(programme_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_session  ON inscriptions_formation(session_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_membre   ON inscriptions_formation(membre_id);
CREATE INDEX IF NOT EXISTS idx_attestations_session  ON attestations_formation(session_id);
CREATE INDEX IF NOT EXISTS idx_attestations_membre   ON attestations_formation(membre_id);
