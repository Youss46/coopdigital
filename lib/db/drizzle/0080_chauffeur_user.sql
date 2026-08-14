-- Migration 0080 : ajout chauffeur_id sur users + rôle chauffeur
ALTER TABLE users ADD COLUMN IF NOT EXISTS chauffeur_id integer REFERENCES chauffeurs(id) ON DELETE SET NULL;
