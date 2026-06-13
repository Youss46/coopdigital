CREATE TABLE IF NOT EXISTS "portail_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "membre_id" integer NOT NULL REFERENCES "membres"("id") ON DELETE CASCADE,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id") ON DELETE CASCADE,
  "type" varchar(50) DEFAULT 'info' NOT NULL,
  "titre" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "lien" varchar(500),
  "lu" boolean DEFAULT false NOT NULL,
  "date_lu" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
