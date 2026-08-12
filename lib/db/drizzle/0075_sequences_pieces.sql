-- Compteurs de numérotation séquentielle par coopérative et par exercice
-- Remplace l'utilisation de l'ID auto-increment global comme numéro de pièce.
-- L'incrémentation est atomique via INSERT … ON CONFLICT DO UPDATE.
CREATE TABLE IF NOT EXISTS sequences_pieces_comptables (
  id             serial PRIMARY KEY,
  cooperative_id integer NOT NULL,
  exercice       integer NOT NULL,
  compteur       integer NOT NULL DEFAULT 0,
  CONSTRAINT sequences_pieces_comptables_coop_exercice_unique
    UNIQUE (cooperative_id, exercice)
);
