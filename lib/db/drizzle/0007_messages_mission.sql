-- Créer missions_terrain d'abord (messages_mission en dépend)
CREATE TABLE IF NOT EXISTS "missions_terrain" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "titre" text NOT NULL,
  "zone_type" varchar(30) NOT NULL,
  "zone_nom" text NOT NULL,
  "date_prevue" date NOT NULL,
  "agent_id" integer,
  "cree_par" integer,
  "statut" varchar(20) DEFAULT 'planifiee',
  "objectif_parcelles" integer,
  "parcelles_collectees" integer DEFAULT 0,
  "motif_rejet" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "missions_membres" (
  "id" serial PRIMARY KEY NOT NULL,
  "mission_id" integer NOT NULL REFERENCES "missions_terrain"("id") ON DELETE CASCADE,
  "membre_id" integer NOT NULL,
  "statut" varchar(20) DEFAULT 'a_faire',
  "gps_collecte" jsonb,
  "photos_collectees" jsonb,
  "notes_agent" text,
  "date_collecte" timestamp with time zone,
  "motif_rejet" text
);

CREATE INDEX IF NOT EXISTS "idx_missions_agent" ON "missions_terrain" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_missions_cooperative" ON "missions_terrain" ("cooperative_id");
CREATE INDEX IF NOT EXISTS "idx_missions_statut" ON "missions_terrain" ("statut");
CREATE INDEX IF NOT EXISTS "idx_missions_membres_mission" ON "missions_membres" ("mission_id");
CREATE INDEX IF NOT EXISTS "idx_missions_membres_membre" ON "missions_membres" ("membre_id");

-- Table messages_mission (dépend de missions_terrain)
CREATE TABLE IF NOT EXISTS "messages_mission" (
  "id" serial PRIMARY KEY NOT NULL,
  "mission_id" integer REFERENCES "missions_terrain"("id"),
  "auteur_id" integer REFERENCES "users"("id"),
  "message" text NOT NULL,
  "type" varchar(20) DEFAULT 'commentaire',
  "lu" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_messages_mission_mission_id" ON "messages_mission" ("mission_id");
