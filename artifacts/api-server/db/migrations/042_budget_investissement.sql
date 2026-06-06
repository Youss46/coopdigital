-- Migration 042 : Module Budget Investissement
-- projets_investissement + depenses_investissement

CREATE TABLE projets_investissement (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL REFERENCES cooperatives(id),
  titre                   VARCHAR(300) NOT NULL,
  description             TEXT,
  categorie               VARCHAR(50) NOT NULL DEFAULT 'autre'
                            CHECK (categorie IN ('infrastructure','equipement','vehicule','informatique','autre')),
  montant_estime_fcfa     NUMERIC(18,0) NOT NULL,
  montant_engage_fcfa     NUMERIC(18,0) NOT NULL DEFAULT 0,
  montant_realise_fcfa    NUMERIC(18,0) NOT NULL DEFAULT 0,
  source_financement      VARCHAR(30) NOT NULL DEFAULT 'fonds_propres'
                            CHECK (source_financement IN ('fonds_propres','emprunt','subvention','mixte')),
  emprunt_id              INTEGER REFERENCES emprunts(id) ON DELETE SET NULL,
  subvention_id           INTEGER REFERENCES subventions(id) ON DELETE SET NULL,
  date_debut_prevue       DATE,
  date_fin_prevue         DATE,
  date_fin_reelle         DATE,
  statut                  VARCHAR(20) NOT NULL DEFAULT 'planifie'
                            CHECK (statut IN ('planifie','en_cours','termine','suspendu','annule')),
  priorite                VARCHAR(20) NOT NULL DEFAULT 'normale'
                            CHECK (priorite IN ('haute','normale','basse')),
  responsable_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE depenses_investissement (
  id                  SERIAL PRIMARY KEY,
  projet_id           INTEGER NOT NULL REFERENCES projets_investissement(id) ON DELETE CASCADE,
  cooperative_id      INTEGER NOT NULL REFERENCES cooperatives(id),
  date_depense        DATE NOT NULL,
  libelle             VARCHAR(300) NOT NULL,
  montant_fcfa        NUMERIC(18,0) NOT NULL,
  fournisseur         VARCHAR(200),
  reference_facture   VARCHAR(100),
  facture_url         VARCHAR(500),
  equipement_id       INTEGER REFERENCES equipements(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projets_inv_coop    ON projets_investissement (cooperative_id);
CREATE INDEX idx_projets_inv_statut  ON projets_investissement (statut);
CREATE INDEX idx_depenses_inv_projet ON depenses_investissement (projet_id);
CREATE INDEX idx_depenses_inv_coop   ON depenses_investissement (cooperative_id);
