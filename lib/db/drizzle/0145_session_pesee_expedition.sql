ALTER TABLE sessions_pesee
  ADD COLUMN IF NOT EXISTS expedition_id integer REFERENCES expeditions(id);

CREATE INDEX IF NOT EXISTS sessions_pesee_expedition_idx
  ON sessions_pesee (expedition_id);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_pesee_expedition_active_uq
  ON sessions_pesee (expedition_id)
  WHERE expedition_id IS NOT NULL AND statut = 'en_cours';