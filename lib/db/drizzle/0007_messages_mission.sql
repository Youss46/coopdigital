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
