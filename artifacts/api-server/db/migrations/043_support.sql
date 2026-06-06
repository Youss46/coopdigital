-- Migration 043 : Module Support tickets

CREATE TABLE tickets_support (
  id                  SERIAL PRIMARY KEY,
  cooperative_id      INTEGER NOT NULL REFERENCES cooperatives(id),
  reference           VARCHAR(20) NOT NULL UNIQUE,
  titre               VARCHAR(300) NOT NULL,
  description         TEXT NOT NULL,
  categorie           VARCHAR(30)  DEFAULT 'question'
                        CHECK (categorie IN ('bug','question','formation','evolution','urgence')),
  priorite            VARCHAR(20)  NOT NULL DEFAULT 'normale'
                        CHECK (priorite IN ('basse','normale','haute','urgente')),
  module_concerne     VARCHAR(50),
  capture_ecran_url   VARCHAR(500),
  ouvert_par          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  statut              VARCHAR(20)  NOT NULL DEFAULT 'ouvert'
                        CHECK (statut IN ('ouvert','en_cours','resolu','ferme')),
  assigne_m15         VARCHAR(200),
  date_resolution     TIMESTAMP WITH TIME ZONE,
  satisfaction        INTEGER CHECK (satisfaction BETWEEN 1 AND 5),
  sms_haute_envoye    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE messages_ticket (
  id                SERIAL PRIMARY KEY,
  ticket_id         INTEGER NOT NULL REFERENCES tickets_support(id) ON DELETE CASCADE,
  auteur_type       VARCHAR(10) NOT NULL CHECK (auteur_type IN ('client','m15tech')),
  auteur_id         INTEGER,
  auteur_nom        VARCHAR(200) NOT NULL,
  contenu           TEXT NOT NULL,
  piece_jointe_url  VARCHAR(500),
  lu                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_coop     ON tickets_support (cooperative_id);
CREATE INDEX idx_tickets_statut   ON tickets_support (statut);
CREATE INDEX idx_tickets_priorite ON tickets_support (priorite);
CREATE INDEX idx_messages_ticket  ON messages_ticket (ticket_id);
