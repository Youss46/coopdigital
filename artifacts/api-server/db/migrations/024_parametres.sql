-- Migration 024: Paramètres coopérative & documents officiels

-- ─── config_cooperative ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_cooperative (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,

  -- IDENTITÉ
  nom_complet                 VARCHAR(255),
  nom_abrege                  VARCHAR(100),
  logo_url                    VARCHAR(500),
  slogan                      VARCHAR(255),

  -- COORDONNÉES
  adresse                     VARCHAR(255),
  ville                       VARCHAR(100),
  region                      VARCHAR(100),
  pays                        VARCHAR(100) DEFAULT 'Côte d''Ivoire',
  telephone                   VARCHAR(30),
  telephone2                  VARCHAR(30),
  email                       VARCHAR(255),
  site_web                    VARCHAR(255),
  boite_postale               VARCHAR(50),

  -- JURIDIQUE
  numero_agrement             VARCHAR(100),
  date_agrement               DATE,
  autorite_agrement           VARCHAR(255),
  forme_juridique             VARCHAR(100) DEFAULT 'Coopérative agricole',
  numero_rccm                 VARCHAR(100),
  numero_contribuable         VARCHAR(100),
  date_creation               DATE,

  -- FINANCIER
  banque_principale           VARCHAR(255),
  numero_compte_bancaire      VARCHAR(100),
  iban                        VARCHAR(50),
  swift                       VARCHAR(20),
  devise                      VARCHAR(10) DEFAULT 'XOF',
  exercice_fiscal_debut_mois  INTEGER DEFAULT 1
    CHECK (exercice_fiscal_debut_mois BETWEEN 1 AND 12),

  -- PRODUCTION
  produit_principal           VARCHAR(50) DEFAULT 'Cacao',
  zone_collecte               VARCHAR(255),
  superficie_totale_ha        NUMERIC(12,2),

  -- PARAMÈTRES OPÉRATIONNELS
  valeur_nominale_part_fcfa   NUMERIC(12,2) DEFAULT 5000,
  nbre_parts_min              INTEGER DEFAULT 5,
  cotisation_annuelle_fcfa    NUMERIC(12,2),
  quorum_ag_pct               NUMERIC(5,2) DEFAULT 50,

  -- APPARENCE PDF
  couleur_primaire            VARCHAR(20) DEFAULT '#1a4731',
  couleur_secondaire          VARCHAR(20) DEFAULT '#c4962a',
  pied_de_page_pdf            TEXT,

  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by                  INTEGER REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE(cooperative_id)
);

CREATE INDEX IF NOT EXISTS idx_config_cooperative_coop
  ON config_cooperative(cooperative_id);

-- ─── documents_officiels ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents_officiels (
  id               SERIAL PRIMARY KEY,
  cooperative_id   INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  type             VARCHAR(50) NOT NULL
    CHECK (type IN ('statuts','reglement_interieur','agrement','certification','contrat_exportateur','autre')),
  libelle          VARCHAR(255) NOT NULL,
  fichier_url      VARCHAR(500) NOT NULL,
  date_document    DATE,
  date_expiration  DATE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_officiels_coop
  ON documents_officiels(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_documents_officiels_expiration
  ON documents_officiels(date_expiration)
  WHERE date_expiration IS NOT NULL;
