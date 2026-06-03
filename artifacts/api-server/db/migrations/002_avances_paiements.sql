-- ============================================================
-- Migration 002 — Module M04 : Avances & Paiements
-- ============================================================

-- 4. Utilisateurs (agents / admins)
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    cooperative_id  INTEGER      REFERENCES cooperatives(id) ON DELETE SET NULL,
    nom             VARCHAR(100) NOT NULL,
    prenoms         VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'agent_terrain'
                        CHECK (role IN ('super_admin','admin','agent_terrain','auditeur')),
    actif           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. Avances
CREATE TABLE IF NOT EXISTS avances (
    id                    SERIAL PRIMARY KEY,
    membre_id             INTEGER      NOT NULL REFERENCES membres(id) ON DELETE RESTRICT,
    montant_octroye_fcfa  INTEGER      NOT NULL CHECK (montant_octroye_fcfa > 0),
    montant_rembourse_fcfa INTEGER     NOT NULL DEFAULT 0 CHECK (montant_rembourse_fcfa >= 0),
    solde_restant_fcfa    INTEGER      NOT NULL,   -- mis à jour à chaque livraison
    date_octroi           DATE         NOT NULL DEFAULT CURRENT_DATE,
    date_echeance         DATE,
    motif                 TEXT,
    statut                VARCHAR(15)  NOT NULL DEFAULT 'en_cours'
                              CHECK (statut IN ('en_cours','rembourse','en_retard')),
    agent_id              INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 6. Livraisons de cacao
CREATE TABLE IF NOT EXISTS livraisons (
    id                   SERIAL PRIMARY KEY,
    membre_id            INTEGER       NOT NULL REFERENCES membres(id) ON DELETE RESTRICT,
    poids_kg             NUMERIC(8,2)  NOT NULL CHECK (poids_kg > 0),
    prix_unitaire_fcfa   INTEGER       NOT NULL CHECK (prix_unitaire_fcfa > 0),
    montant_brut_fcfa    INTEGER       NOT NULL,  -- poids_kg × prix_unitaire_fcfa
    avance_deduite_fcfa  INTEGER       NOT NULL DEFAULT 0,
    montant_net_fcfa     INTEGER       NOT NULL,  -- montant_brut - avance_deduite
    date_livraison       DATE          NOT NULL DEFAULT CURRENT_DATE,
    agent_id             INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 7. Paiements
CREATE TABLE IF NOT EXISTS paiements (
    id                       SERIAL PRIMARY KEY,
    livraison_id             INTEGER      NOT NULL REFERENCES livraisons(id) ON DELETE CASCADE,
    membre_id                INTEGER      NOT NULL REFERENCES membres(id) ON DELETE RESTRICT,
    montant_fcfa             INTEGER      NOT NULL CHECK (montant_fcfa >= 0),
    mode_paiement            VARCHAR(20)  NOT NULL DEFAULT 'especes'
                                 CHECK (mode_paiement IN ('orange_money','mtn_momo','especes')),
    reference_transaction    VARCHAR(100),
    statut                   VARCHAR(15)  NOT NULL DEFAULT 'en_attente'
                                 CHECK (statut IN ('en_attente','confirme','echec')),
    recu_envoye_whatsapp     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_avances_membre_id     ON avances(membre_id);
CREATE INDEX IF NOT EXISTS idx_avances_statut        ON avances(statut);
CREATE INDEX IF NOT EXISTS idx_livraisons_membre_id  ON livraisons(membre_id);
CREATE INDEX IF NOT EXISTS idx_livraisons_date       ON livraisons(date_livraison);
CREATE INDEX IF NOT EXISTS idx_paiements_livraison   ON paiements(livraison_id);
CREATE INDEX IF NOT EXISTS idx_paiements_membre      ON paiements(membre_id);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
