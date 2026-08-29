CREATE TABLE IF NOT EXISTS cooperative_roles (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  role_key VARCHAR(40) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'active',
  updated_by INTEGER REFERENCES m15_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_roles_mode_ck CHECK (mode IN ('active', 'disabled')),
  CONSTRAINT cooperative_roles_coop_key_uq UNIQUE (cooperative_id, role_key)
);

CREATE INDEX IF NOT EXISTS cooperative_roles_coop_idx
  ON cooperative_roles (cooperative_id);

CREATE TABLE IF NOT EXISTS cooperative_role_history (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  role_key VARCHAR(40) NOT NULL,
  previous_mode VARCHAR(20),
  new_mode VARCHAR(20) NOT NULL,
  reason TEXT,
  details JSONB,
  changed_by INTEGER REFERENCES m15_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_role_history_mode_ck CHECK (new_mode IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS cooperative_role_history_coop_idx
  ON cooperative_role_history (cooperative_id, created_at);

CREATE INDEX IF NOT EXISTS cooperative_role_history_role_idx
  ON cooperative_role_history (role_key);