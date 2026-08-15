CREATE TABLE IF NOT EXISTS "stations_carburant" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "nom" varchar(255) NOT NULL,
  "adresse" text,
  "types_carburant" varchar(100) NOT NULL DEFAULT 'gasoil',
  "actif" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
