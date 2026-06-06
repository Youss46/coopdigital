-- 031 — Parcelles, Historique rendements, Zones risque EUDR

CREATE TABLE IF NOT EXISTS parcelles (
  id                        SERIAL PRIMARY KEY,
  cooperative_id            INTEGER NOT NULL REFERENCES cooperatives(id),
  membre_id                 INTEGER NOT NULL REFERENCES membres(id),

  -- IDENTIFICATION
  code_parcelle             VARCHAR UNIQUE,
  nom_parcelle              VARCHAR,

  -- LOCALISATION
  village                   VARCHAR,
  section                   VARCHAR,
  region                    VARCHAR,
  coordonnees_point         JSONB,
  polygone                  JSONB,
  superficie_declaree_ha    NUMERIC(10,4),
  superficie_calculee_ha    NUMERIC(10,4),

  -- CULTURE
  culture_principale        VARCHAR,
  culture_secondaire        VARCHAR,
  annee_plantation          INTEGER,
  variete                   VARCHAR,

  -- CONFORMITÉ EUDR
  eudr_statut               VARCHAR DEFAULT 'non_verifie',
  eudr_date_verification    DATE,
  eudr_risque_deforestation VARCHAR DEFAULT 'inconnu',
  eudr_dans_zone_protegee   BOOLEAN DEFAULT false,
  eudr_commentaire          TEXT,

  -- CERTIFICATION
  certification_statut      VARCHAR,
  organisme_certificateur   VARCHAR,
  date_certification        DATE,
  date_expiration_cert      DATE,
  numero_certificat         VARCHAR,

  -- PRODUCTION
  rendement_moyen_kg_ha     NUMERIC(10,2),
  derniere_campagne_kg      NUMERIC(10,2),

  -- STATUT
  actif                     BOOLEAN DEFAULT true,
  date_enregistrement       DATE,
  enregistre_par            INTEGER REFERENCES users(id),
  photo_url                 VARCHAR,
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historique_rendements (
  id              SERIAL PRIMARY KEY,
  parcelle_id     INTEGER NOT NULL REFERENCES parcelles(id) ON DELETE CASCADE,
  campagne_id     INTEGER REFERENCES campagnes(id),
  poids_kg        NUMERIC(10,2),
  superficie_ha   NUMERIC(10,4),
  rendement_kg_ha NUMERIC(10,2) GENERATED ALWAYS AS (poids_kg / NULLIF(superficie_ha, 0)) STORED,
  qualite_moyenne VARCHAR,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zones_risque_eudr (
  id             SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  nom_zone       VARCHAR NOT NULL,
  type_zone      VARCHAR NOT NULL,
  polygone_zone  JSONB   NOT NULL,
  source         VARCHAR,
  date_import    DATE,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcelles_cooperative ON parcelles(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_membre      ON parcelles(membre_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_eudr        ON parcelles(eudr_statut);
CREATE INDEX IF NOT EXISTS idx_hist_rend_parcelle    ON historique_rendements(parcelle_id);
CREATE INDEX IF NOT EXISTS idx_zones_cooperative     ON zones_risque_eudr(cooperative_id);
