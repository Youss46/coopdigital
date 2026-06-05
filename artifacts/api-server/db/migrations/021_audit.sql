-- Migration 021: Journal d'audit (piste d'audit inaltérable)

-- ─── audit_trail ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_trail (
  id               BIGSERIAL PRIMARY KEY,
  cooperative_id   INTEGER REFERENCES cooperatives(id),

  -- QUI
  user_id          INTEGER,
  user_nom         VARCHAR(255),
  user_role        VARCHAR(100),
  user_ip          VARCHAR(100),
  user_agent       VARCHAR(500),

  -- QUOI
  action           VARCHAR(50) NOT NULL,
  module           VARCHAR(100) NOT NULL,
  entite_type      VARCHAR(100),
  entite_id        INTEGER,

  -- AVANT / APRÈS
  valeurs_avant    JSONB,
  valeurs_apres    JSONB,
  champs_modifies  TEXT[],

  -- CONTEXTE
  description      VARCHAR(500),
  ip_address       INET,
  session_id       VARCHAR(255),
  campagne_id      INTEGER,

  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_audit_cooperative ON audit_trail(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_module     ON audit_trail(module);
CREATE INDEX IF NOT EXISTS idx_audit_entite     ON audit_trail(entite_type, entite_id);
CREATE INDEX IF NOT EXISTS idx_audit_date       ON audit_trail(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_trail(action);

-- Contrainte d'inaltérabilité via RLS
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_trail
  FOR INSERT WITH CHECK (true);

-- ─── sessions_utilisateurs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions_utilisateurs (
  id                   SERIAL PRIMARY KEY,
  cooperative_id       INTEGER REFERENCES cooperatives(id),
  user_id              INTEGER NOT NULL,
  session_token        VARCHAR(255) UNIQUE NOT NULL,
  ip_address           INET,
  user_agent           VARCHAR(500),
  date_connexion       TIMESTAMP NOT NULL DEFAULT NOW(),
  date_deconnexion     TIMESTAMP,
  duree_session_min    INTEGER,
  nb_actions           INTEGER NOT NULL DEFAULT 0,
  statut               VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (statut IN ('active', 'expiree', 'deconnectee'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions_utilisateurs(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_coop  ON sessions_utilisateurs(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions_utilisateurs(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_date  ON sessions_utilisateurs(date_connexion DESC);
