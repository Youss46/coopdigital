-- Migration 032 : Module RSE (Responsabilité Sociale des Entreprises)

-- Étendre membres avec données démographiques pour le calcul RSE
ALTER TABLE membres ADD COLUMN IF NOT EXISTS sexe VARCHAR(1);
ALTER TABLE membres ADD COLUMN IF NOT EXISTS date_naissance DATE;

-- ── Table des indicateurs RSE par campagne ──────────────────────────────────
CREATE TABLE IF NOT EXISTS indicateurs_rse (
  id                              SERIAL PRIMARY KEY,
  cooperative_id                  INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id                     INTEGER NOT NULL REFERENCES campagnes(id),

  -- DIMENSION SOCIALE
  nb_membres_total                INTEGER,
  nb_membres_femmes               INTEGER,
  nb_membres_jeunes               INTEGER,
  pct_femmes                      NUMERIC(5,2) GENERATED ALWAYS AS (
                                    nb_membres_femmes * 100.0 / NULLIF(nb_membres_total, 0)
                                  ) STORED,
  revenu_moyen_membre_fcfa        NUMERIC,
  revenu_median_membre_fcfa       NUMERIC,
  revenu_min_membre_fcfa          NUMERIC,
  revenu_max_membre_fcfa          NUMERIC,
  seuil_pauvrete_fcfa             NUMERIC          DEFAULT 750000,
  nb_membres_sous_seuil           INTEGER,
  pct_membres_sous_seuil          NUMERIC(5,2),

  -- FORMATION & RENFORCEMENT
  nb_formations_dispensees        INTEGER          DEFAULT 0,
  nb_beneficiaires_formation      INTEGER          DEFAULT 0,
  thematiques_formation           TEXT[],
  nb_jours_formation              INTEGER          DEFAULT 0,

  -- DIMENSION ENVIRONNEMENTALE
  superficie_totale_ha            NUMERIC,
  superficie_certifiee_ha         NUMERIC,
  pct_superficie_certifiee        NUMERIC(5,2),
  superficie_sous_ombrage_ha      NUMERIC,
  nb_arbres_plantes               INTEGER          DEFAULT 0,
  superficie_deforestation_evitee_ha NUMERIC       DEFAULT 0,
  nb_parcelles_conformes_eudr     INTEGER,
  pct_conformite_eudr             NUMERIC(5,2),

  -- CERTIFICATION
  nb_membres_certifies_utz        INTEGER          DEFAULT 0,
  nb_membres_certifies_rainforest INTEGER          DEFAULT 0,
  nb_membres_certifies_fairtrade  INTEGER          DEFAULT 0,
  nb_membres_certifies_eudr       INTEGER          DEFAULT 0,
  pct_membres_certifies           NUMERIC(5,2),

  -- ÉCONOMIQUE & GOUVERNANCE
  prix_moyen_paye_kg_fcfa         NUMERIC,
  prime_qualite_distribuee_fcfa   NUMERIC          DEFAULT 0,
  prime_certification_fcfa        NUMERIC          DEFAULT 0,
  subventions_intrants_fcfa       NUMERIC          DEFAULT 0,
  taux_remboursement_avances_pct  NUMERIC(5,2),
  nb_ag_tenues                    INTEGER          DEFAULT 0,
  taux_participation_ag_pct       NUMERIC(5,2)     DEFAULT 0,

  engagements_campagne_suivante   TEXT,
  date_calcul                     TIMESTAMP,
  calcule_par                     INTEGER          REFERENCES users(id),
  created_at                      TIMESTAMP        DEFAULT NOW(),

  UNIQUE (cooperative_id, campagne_id)
);

-- ── Table des formations RSE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formations_rse (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id     INTEGER REFERENCES campagnes(id),
  titre           VARCHAR,
  thematique      VARCHAR,
  date_formation  DATE,
  lieu            VARCHAR,
  formateur       VARCHAR,
  nb_participants INTEGER,
  nb_femmes       INTEGER,
  duree_jours     NUMERIC(4,1),
  financement     VARCHAR,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicateurs_rse_coop_camp ON indicateurs_rse(cooperative_id, campagne_id);
CREATE INDEX IF NOT EXISTS idx_formations_rse_coop_camp  ON formations_rse(cooperative_id, campagne_id);
