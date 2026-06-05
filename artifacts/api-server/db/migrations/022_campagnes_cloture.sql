-- Migration 022 — Tables bilan et vérifications de clôture de campagne

CREATE TABLE IF NOT EXISTS bilans_campagne (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id),
  campagne_id                 INTEGER NOT NULL UNIQUE REFERENCES campagnes(id),

  -- PRODUCTION
  tonnage_total_kg            NUMERIC(14,2)  DEFAULT 0,
  tonnage_membres_kg          NUMERIC(14,2)  DEFAULT 0,
  tonnage_pisteurs_kg         NUMERIC(14,2)  DEFAULT 0,
  tonnage_externes_kg         NUMERIC(14,2)  DEFAULT 0,
  nb_livraisons               INTEGER        DEFAULT 0,
  nb_membres_actifs           INTEGER        DEFAULT 0,
  nb_fournisseurs_total       INTEGER        DEFAULT 0,
  prix_achat_moyen_kg_fcfa    NUMERIC(12,2)  DEFAULT 0,

  -- VENTES
  tonnage_vendu_kg            NUMERIC(14,2)  DEFAULT 0,
  ca_ventes_fcfa              NUMERIC(16,2)  DEFAULT 0,
  prix_vente_moyen_kg_fcfa    NUMERIC(12,2)  DEFAULT 0,
  nb_exportateurs             INTEGER        DEFAULT 0,
  creances_restantes_fcfa     NUMERIC(16,2)  DEFAULT 0,

  -- FINANCIER
  cout_achat_total_fcfa       NUMERIC(16,2)  DEFAULT 0,
  charges_exploitation_fcfa   NUMERIC(16,2)  DEFAULT 0,
  charges_personnel_fcfa      NUMERIC(16,2)  DEFAULT 0,
  charges_financieres_fcfa    NUMERIC(16,2)  DEFAULT 0,
  marge_brute_fcfa            NUMERIC(16,2)  DEFAULT 0,
  marge_nette_fcfa            NUMERIC(16,2)  DEFAULT 0,
  marge_kg_fcfa               NUMERIC(12,2)  DEFAULT 0,

  -- AVANCES & INTRANTS
  avances_octroyees_fcfa      NUMERIC(16,2)  DEFAULT 0,
  avances_remboursees_fcfa    NUMERIC(16,2)  DEFAULT 0,
  avances_solde_fcfa          NUMERIC(16,2)  DEFAULT 0,
  intrants_distribues_fcfa    NUMERIC(16,2)  DEFAULT 0,
  intrants_recouvres_fcfa     NUMERIC(16,2)  DEFAULT 0,

  -- MEMBRES
  parts_sociales_collectees_fcfa  NUMERIC(16,2)  DEFAULT 0,
  cotisations_collectees_fcfa     NUMERIC(16,2)  DEFAULT 0,

  -- COMPARAISON vs campagne précédente
  variation_tonnage_pct       NUMERIC(8,2),
  variation_ca_pct            NUMERIC(8,2),
  variation_marge_pct         NUMERIC(8,2),

  date_generation             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  genere_par                  INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS verifications_cloture (
  id            SERIAL PRIMARY KEY,
  campagne_id   INTEGER NOT NULL REFERENCES campagnes(id),
  code          VARCHAR(10) NOT NULL,
  verification  VARCHAR(255) NOT NULL,
  statut        VARCHAR(20) NOT NULL CHECK (statut IN ('ok', 'bloquant', 'avertissement')),
  message       VARCHAR(512),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bilans_campagne_campagne_id   ON bilans_campagne(campagne_id);
CREATE INDEX IF NOT EXISTS idx_verifications_campagne_id     ON verifications_cloture(campagne_id);
