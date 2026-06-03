-- ============================================================
-- Migration 004 — Module M03 : Gestion des stocks
-- ============================================================

-- 1. Entrepôts
CREATE TABLE IF NOT EXISTS entrepots (
    id              SERIAL PRIMARY KEY,
    cooperative_id  INTEGER      NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
    nom             VARCHAR(150) NOT NULL,
    ville           VARCHAR(100) NOT NULL,
    capacite_kg     NUMERIC(10,2) NOT NULL CHECK (capacite_kg > 0),
    seuil_alerte_kg NUMERIC(10,2),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Type enum mouvement_type (idempotent)
DO $$ BEGIN
    CREATE TYPE mouvement_type AS ENUM ('entree', 'sortie');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Mouvements de stock
CREATE TABLE IF NOT EXISTS mouvements_stock (
    id              SERIAL PRIMARY KEY,
    entrepot_id     INTEGER      NOT NULL REFERENCES entrepots(id) ON DELETE RESTRICT,
    lot_id          INTEGER      REFERENCES lots(id),
    type            mouvement_type NOT NULL,
    poids_kg        NUMERIC(10,2) NOT NULL CHECK (poids_kg > 0),
    motif           TEXT,
    agent_id        INTEGER      REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_entrepots_cooperative   ON entrepots(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_entrepot_id  ON mouvements_stock(entrepot_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_lot_id       ON mouvements_stock(lot_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_created_at   ON mouvements_stock(created_at);

-- Seed : un entrepôt par défaut
INSERT INTO entrepots (cooperative_id, nom, ville, capacite_kg, seuil_alerte_kg)
SELECT 1, 'Entrepôt Central Méagui', 'Méagui', 50000, 5000
WHERE NOT EXISTS (SELECT 1 FROM entrepots LIMIT 1);
