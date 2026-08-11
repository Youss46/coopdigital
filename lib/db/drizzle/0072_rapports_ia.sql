CREATE TABLE IF NOT EXISTS "rapports_ia" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "campagne_id" integer REFERENCES "campagnes"("id"),
  "titre" text NOT NULL,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "contenu" text NOT NULL,
  "genere_par" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "rapports_ia_coop_idx" ON "rapports_ia" ("cooperative_id");
