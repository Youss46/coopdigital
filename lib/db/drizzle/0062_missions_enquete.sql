-- Migration 0062 : Missions d'enquête pour la certification des membres

CREATE TABLE IF NOT EXISTS "missions_enquete" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "certification_id" integer NOT NULL REFERENCES "certifications"("id"),
  "titre" text NOT NULL,
  "date_prevue" date NOT NULL,
  "agent_id" integer,
  "cree_par" integer,
  "statut" varchar(20) DEFAULT 'planifiee',
  "instructions" text,
  "objectif_membres" integer,
  "membres_collectes" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "enquete_membres" (
  "id" serial PRIMARY KEY NOT NULL,
  "mission_id" integer NOT NULL,
  "membre_id" integer NOT NULL,
  "statut" varchar(20) DEFAULT 'a_faire',
  "reponses" jsonb,
  "score_calcule" real,
  "statut_conformite" varchar(30),
  "notes_agent" text,
  "date_collecte" timestamptz
);
