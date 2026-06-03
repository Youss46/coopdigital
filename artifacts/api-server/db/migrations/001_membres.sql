-- ============================================================
-- Migration 001 — Module M01 : Membres
-- ============================================================

-- 1. Coopératives
CREATE TABLE IF NOT EXISTS cooperatives (
    id          SERIAL PRIMARY KEY,
    nom         VARCHAR(255) NOT NULL,
    ville       VARCHAR(100) NOT NULL,
    region      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Membres
CREATE TABLE IF NOT EXISTS membres (
    id               SERIAL PRIMARY KEY,
    cooperative_id   INTEGER      NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
    nom              VARCHAR(100) NOT NULL,
    prenoms          VARCHAR(150) NOT NULL,
    numero_cni       VARCHAR(50),
    telephone        VARCHAR(20)  NOT NULL,
    village          VARCHAR(100),
    groupement       VARCHAR(150),
    superficie_ha    NUMERIC(8,2) NOT NULL CHECK (superficie_ha > 0),
    statut           VARCHAR(10)  NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
    qr_code_token    UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    date_adhesion    DATE         NOT NULL DEFAULT CURRENT_DATE,
    photo_url        TEXT,
    parcelle_lat     NUMERIC(10,7),
    parcelle_lng     NUMERIC(10,7),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (cooperative_id, telephone)
);

-- 3. Cotisations
CREATE TABLE IF NOT EXISTS cotisations (
    id               SERIAL PRIMARY KEY,
    membre_id        INTEGER      NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
    montant_fcfa     INTEGER      NOT NULL CHECK (montant_fcfa >= 0),
    annee            SMALLINT     NOT NULL,
    statut_paiement  VARCHAR(20)  NOT NULL DEFAULT 'en_attente' CHECK (statut_paiement IN ('paye','en_attente','partiel')),
    date_paiement    DATE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_membres_cooperative_id   ON membres(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_membres_qr_code_token    ON membres(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_membres_telephone        ON membres(telephone);
CREATE INDEX IF NOT EXISTS idx_cotisations_membre_id    ON cotisations(membre_id);
