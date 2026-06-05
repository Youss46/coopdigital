-- Migration 017 : Module Gouvernance — Assemblées Générales

CREATE TYPE ag_type    AS ENUM ('ordinaire','extraordinaire','constitutive');
CREATE TYPE ag_statut  AS ENUM ('planifiee','ouverte','cloturee','annulee');
CREATE TYPE mode_pres  AS ENUM ('physique','procuration');
CREATE TYPE point_type AS ENUM ('information','deliberation','vote','election');
CREATE TYPE point_statut AS ENUM ('en_attente','en_cours','traite');
CREATE TYPE vote_resultat AS ENUM ('adopte','rejete','nul');
CREATE TYPE canal_convo AS ENUM ('sms','whatsapp','affichage');

CREATE TABLE assemblees_generales (
  id                  SERIAL PRIMARY KEY,
  cooperative_id      INTEGER NOT NULL REFERENCES cooperatives(id),
  type                ag_type NOT NULL DEFAULT 'ordinaire',
  libelle             VARCHAR(300) NOT NULL,
  date_ag             DATE NOT NULL,
  heure_debut         TIME,
  heure_fin           TIME,
  lieu                VARCHAR(300),
  ordre_du_jour       TEXT[] DEFAULT '{}',
  quorum_requis_pct   NUMERIC(5,2) NOT NULL DEFAULT 50,
  nb_membres_convoques INTEGER DEFAULT 0,
  nb_membres_presents  INTEGER NOT NULL DEFAULT 0,
  quorum_atteint      BOOLEAN NOT NULL DEFAULT false,
  statut              ag_statut NOT NULL DEFAULT 'planifiee',
  pv_url              VARCHAR(500),
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE presences_ag (
  id                  SERIAL PRIMARY KEY,
  ag_id               INTEGER NOT NULL REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  membre_id           INTEGER NOT NULL REFERENCES membres(id),
  mode_presence       mode_pres NOT NULL DEFAULT 'physique',
  mandataire_id       INTEGER REFERENCES membres(id),
  heure_arrivee       TIMESTAMP WITH TIME ZONE,
  emargement_numerique BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (ag_id, membre_id)
);

CREATE TABLE points_ordre_du_jour (
  id              SERIAL PRIMARY KEY,
  ag_id           INTEGER NOT NULL REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  numero          INTEGER NOT NULL,
  intitule        VARCHAR(500) NOT NULL,
  type            point_type NOT NULL DEFAULT 'information',
  rapporteur      VARCHAR(200),
  duree_minutes   INTEGER,
  statut          point_statut NOT NULL DEFAULT 'en_attente',
  decision        TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE votes_ag (
  id                   SERIAL PRIMARY KEY,
  ag_id                INTEGER NOT NULL REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  point_id             INTEGER NOT NULL REFERENCES points_ordre_du_jour(id) ON DELETE CASCADE,
  intitule_resolution  VARCHAR(500) NOT NULL,
  nb_pour              INTEGER NOT NULL DEFAULT 0,
  nb_contre            INTEGER NOT NULL DEFAULT 0,
  nb_abstention        INTEGER NOT NULL DEFAULT 0,
  nb_votants           INTEGER NOT NULL DEFAULT 0,
  resultat             vote_resultat NOT NULL DEFAULT 'nul',
  pourcentage_pour     NUMERIC(5,2),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE convocations_ag (
  id             SERIAL PRIMARY KEY,
  ag_id          INTEGER NOT NULL REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  canal          canal_convo NOT NULL DEFAULT 'sms',
  date_envoi     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  nb_envoyes     INTEGER NOT NULL DEFAULT 0,
  nb_recus       INTEGER NOT NULL DEFAULT 0,
  message_envoye TEXT,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ag_cooperative ON assemblees_generales(cooperative_id);
CREATE INDEX idx_ag_date ON assemblees_generales(date_ag);
CREATE INDEX idx_presences_ag ON presences_ag(ag_id);
CREATE INDEX idx_presences_membre ON presences_ag(membre_id);
CREATE INDEX idx_points_ag ON points_ordre_du_jour(ag_id);
CREATE INDEX idx_votes_ag ON votes_ag(ag_id);
CREATE INDEX idx_votes_point ON votes_ag(point_id);
