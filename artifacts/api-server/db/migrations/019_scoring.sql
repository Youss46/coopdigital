-- Migration 019 : Module Scoring — classement et scores des membres

-- ─── config_scoring ───────────────────────────────────────────────────────────
CREATE TABLE config_scoring (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL UNIQUE REFERENCES cooperatives(id),
  poids_volume_pct        NUMERIC(5,2) NOT NULL DEFAULT 30,
  poids_qualite_pct       NUMERIC(5,2) NOT NULL DEFAULT 25,
  poids_regularite_pct    NUMERIC(5,2) NOT NULL DEFAULT 20,
  poids_remboursement_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  poids_fidelite_pct      NUMERIC(5,2) NOT NULL DEFAULT 5,
  poids_cotisation_pct    NUMERIC(5,2) NOT NULL DEFAULT 5,
  seuil_bronze            NUMERIC(5,2) NOT NULL DEFAULT 40,
  seuil_argent            NUMERIC(5,2) NOT NULL DEFAULT 60,
  seuil_or                NUMERIC(5,2) NOT NULL DEFAULT 75,
  seuil_platine           NUMERIC(5,2) NOT NULL DEFAULT 90,
  avantages_bronze        TEXT,
  avantages_argent        TEXT,
  avantages_or            TEXT,
  avantages_platine       TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── scores_membres ───────────────────────────────────────────────────────────
CREATE TABLE scores_membres (
  id                    SERIAL PRIMARY KEY,
  cooperative_id        INTEGER NOT NULL REFERENCES cooperatives(id),
  membre_id             INTEGER NOT NULL REFERENCES membres(id),
  campagne_id           INTEGER NOT NULL REFERENCES campagnes(id),
  score_volume          NUMERIC(6,2),
  score_qualite         NUMERIC(6,2),
  score_regularite      NUMERIC(6,2),
  score_remboursement   NUMERIC(6,2),
  score_fidelite        NUMERIC(6,2),
  score_cotisation      NUMERIC(6,2),
  score_global          NUMERIC(6,2),
  niveau                VARCHAR(20),
  rang                  INTEGER,
  date_calcul           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, membre_id, campagne_id)
);

CREATE INDEX idx_scores_campagne    ON scores_membres(campagne_id);
CREATE INDEX idx_scores_membre      ON scores_membres(membre_id);
CREATE INDEX idx_scores_global      ON scores_membres(score_global DESC);

-- ─── Config par défaut ────────────────────────────────────────────────────────
INSERT INTO config_scoring (
  cooperative_id,
  avantages_bronze,
  avantages_argent,
  avantages_or,
  avantages_platine
) VALUES (
  1,
  'Accès aux formations de base',
  'Accès aux formations + Priorité intrants',
  'Avances prioritaires + Formations premium',
  'Avances prioritaires + Taux préférentiel + Accès marchés premium'
) ON CONFLICT DO NOTHING;
