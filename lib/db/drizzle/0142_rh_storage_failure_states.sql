CREATE TABLE IF NOT EXISTS rh_storage_failure_states (
  cooperative_id     INTEGER PRIMARY KEY REFERENCES cooperatives(id) ON DELETE CASCADE,
  failure_count      INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  window_started_at  TIMESTAMPTZ NOT NULL,
  alert_sent         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);