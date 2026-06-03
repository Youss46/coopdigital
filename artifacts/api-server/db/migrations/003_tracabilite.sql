-- ============================================================
-- Migration 003 — Module M02 : Traçabilité QR
-- ============================================================

-- 1. Parcelles des membres
CREATE TABLE IF NOT EXISTS parcelles (
    id               SERIAL PRIMARY KEY,
    membre_id        INTEGER      NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
    superficie_ha    NUMERIC(8,2) NOT NULL CHECK (superficie_ha > 0),
    latitude         NUMERIC(10,7),
    longitude        NUMERIC(10,7),
    village          VARCHAR(100),
    culture_principale VARCHAR(50) NOT NULL DEFAULT 'cacao',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Type enum lot_statut (idempotent)
DO $$ BEGIN
    CREATE TYPE lot_statut AS ENUM ('en_stock', 'vendu', 'transit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Lots de cacao
CREATE TABLE IF NOT EXISTS lots (
    id              SERIAL PRIMARY KEY,
    cooperative_id  INTEGER      NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
    qr_code_lot     UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    statut          lot_statut   NOT NULL DEFAULT 'en_stock',
    poids_total_kg  NUMERIC(10,2) NOT NULL DEFAULT 0,
    date_creation   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    entrepot        VARCHAR(150),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Liaison lot ↔ livraisons
CREATE TABLE IF NOT EXISTS lot_livraisons (
    lot_id          INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    livraison_id    INTEGER NOT NULL REFERENCES livraisons(id),
    PRIMARY KEY (lot_id, livraison_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_parcelles_membre_id ON parcelles(membre_id);
CREATE INDEX IF NOT EXISTS idx_lots_qr_code_lot    ON lots(qr_code_lot);
CREATE INDEX IF NOT EXISTS idx_lots_statut         ON lots(statut);
CREATE INDEX IF NOT EXISTS idx_lot_livraisons_lot  ON lot_livraisons(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_livraisons_liv  ON lot_livraisons(livraison_id);
