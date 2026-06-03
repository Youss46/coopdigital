-- ============================================================
-- Migration 005 — Module M04 étendu : Exportateurs & Créances
--             + Module M07 : Communication SMS
-- ============================================================

-- 1. Exportateurs
CREATE TABLE IF NOT EXISTS exportateurs (
    id              SERIAL PRIMARY KEY,
    cooperative_id  INTEGER      NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
    nom             VARCHAR(200) NOT NULL,
    contact         VARCHAR(100),
    ville           VARCHAR(100),
    agrement_numero VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Type enum vente_statut (idempotent)
DO $$ BEGIN
    CREATE TYPE vente_statut AS ENUM ('en_attente', 'partiel', 'regle', 'en_retard');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Ventes à des exportateurs
CREATE TABLE IF NOT EXISTS ventes_exportateurs (
    id                      SERIAL PRIMARY KEY,
    exportateur_id          INTEGER      NOT NULL REFERENCES exportateurs(id) ON DELETE RESTRICT,
    lot_id                  INTEGER      REFERENCES lots(id),
    poids_kg                NUMERIC(10,2) NOT NULL,
    prix_unitaire_fcfa      INTEGER      NOT NULL,
    montant_total_fcfa      INTEGER      NOT NULL,
    date_vente              DATE         NOT NULL,
    date_echeance_reglement DATE,
    montant_recu_fcfa       INTEGER      NOT NULL DEFAULT 0,
    solde_du_fcfa           INTEGER      NOT NULL,
    statut                  vente_statut NOT NULL DEFAULT 'en_attente',
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Type enum sms_statut (idempotent)
DO $$ BEGIN
    CREATE TYPE sms_statut AS ENUM ('envoye', 'echec', 'partiel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Historique SMS (M07)
CREATE TABLE IF NOT EXISTS historique_sms (
    id               SERIAL PRIMARY KEY,
    cooperative_id   INTEGER      NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
    agent_id         INTEGER      REFERENCES users(id),
    message          TEXT         NOT NULL,
    groupement       VARCHAR(150),
    nb_destinataires INTEGER      NOT NULL DEFAULT 0,
    nb_envoyes       INTEGER      NOT NULL DEFAULT 0,
    nb_echecs        INTEGER      NOT NULL DEFAULT 0,
    statut           sms_statut   NOT NULL DEFAULT 'envoye',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_exportateurs_cooperative ON exportateurs(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_ventes_exportateur_id   ON ventes_exportateurs(exportateur_id);
CREATE INDEX IF NOT EXISTS idx_ventes_statut           ON ventes_exportateurs(statut);
CREATE INDEX IF NOT EXISTS idx_ventes_echeance         ON ventes_exportateurs(date_echeance_reglement);
CREATE INDEX IF NOT EXISTS idx_historique_sms_coop     ON historique_sms(cooperative_id);

-- Seed : un exportateur de test
INSERT INTO exportateurs (cooperative_id, nom, contact, ville, agrement_numero)
SELECT 1, 'SIFCA Export SA', '+225 27 21 24 05 00', 'Abidjan', 'AGR-CI-2023-0042'
WHERE NOT EXISTS (SELECT 1 FROM exportateurs LIMIT 1);
