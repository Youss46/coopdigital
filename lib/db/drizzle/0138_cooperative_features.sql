CREATE TABLE IF NOT EXISTS cooperative_features (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  feature_key VARCHAR(100) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'active',
  updated_by INTEGER REFERENCES m15_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_features_mode_ck CHECK (mode IN ('active', 'lecture_seule', 'disabled')),
  CONSTRAINT cooperative_features_coop_key_uq UNIQUE (cooperative_id, feature_key)
);

CREATE INDEX IF NOT EXISTS cooperative_features_coop_idx
  ON cooperative_features (cooperative_id);

CREATE TABLE IF NOT EXISTS cooperative_feature_history (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  feature_key VARCHAR(100) NOT NULL,
  previous_mode VARCHAR(20),
  new_mode VARCHAR(20) NOT NULL,
  reason TEXT,
  details JSONB,
  changed_by INTEGER REFERENCES m15_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooperative_feature_history_mode_ck
    CHECK (new_mode IN ('active', 'lecture_seule', 'disabled'))
);

CREATE INDEX IF NOT EXISTS cooperative_feature_history_coop_idx
  ON cooperative_feature_history (cooperative_id, created_at);

CREATE INDEX IF NOT EXISTS cooperative_feature_history_feature_idx
  ON cooperative_feature_history (feature_key);