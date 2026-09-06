-- Répare les index critiques absents de certaines bases initialisées avant
-- l'application complète des migrations historiques.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_pesee_unique_en_cours
  ON sessions_pesee (cooperative_id, membre_id)
  WHERE statut = 'en_cours' AND membre_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_pesee_bon_reception_unique"
  ON "sessions_pesee" ("bon_reception_id")
  WHERE "bon_reception_id" IS NOT NULL;