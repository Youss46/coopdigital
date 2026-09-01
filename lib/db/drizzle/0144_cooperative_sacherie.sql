CREATE TABLE IF NOT EXISTS cooperative_sacherie_config (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  responsible_mode VARCHAR(20) NOT NULL DEFAULT 'les_deux',
  updated_by INTEGER REFERENCES m15_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_sacherie_config_mode_ck CHECK (responsible_mode IN ('magasinier', 'sacherie', 'les_deux')),
  CONSTRAINT cooperative_sacherie_config_coop_uq UNIQUE (cooperative_id)
);

CREATE TABLE IF NOT EXISTS cooperative_sacherie_config_history (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  previous_mode VARCHAR(20),
  new_mode VARCHAR(20) NOT NULL,
  reason TEXT,
  changed_by INTEGER REFERENCES m15_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_sacherie_config_history_mode_ck CHECK (new_mode IN ('magasinier', 'sacherie', 'les_deux'))
);

CREATE INDEX IF NOT EXISTS cooperative_sacherie_config_history_coop_idx
  ON cooperative_sacherie_config_history (cooperative_id, created_at);