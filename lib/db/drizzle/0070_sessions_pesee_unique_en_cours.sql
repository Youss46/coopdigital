-- Partial unique index: at most one `en_cours` session per (cooperative, membre).
-- NULL membre_id (anonymous sessions) are excluded from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_pesee_unique_en_cours
  ON sessions_pesee (cooperative_id, membre_id)
  WHERE statut = 'en_cours' AND membre_id IS NOT NULL;
