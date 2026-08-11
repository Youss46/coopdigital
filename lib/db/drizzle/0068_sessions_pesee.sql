CREATE TYPE "public"."session_pesee_statut" AS ENUM('en_cours', 'terminee', 'annulee');

CREATE TABLE "sessions_pesee" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "numero_session" varchar(30) NOT NULL,
  "membre_id" integer REFERENCES "membres"("id"),
  "produit" varchar(100) NOT NULL DEFAULT 'cacao',
  "operation" varchar(50) NOT NULL DEFAULT 'reception',
  "peseur_id" integer REFERENCES "users"("id"),
  "balance_id" integer,
  "statut" "session_pesee_statut" NOT NULL DEFAULT 'en_cours',
  "poids_total_kg" numeric(12,3) NOT NULL DEFAULT 0,
  "nb_sacs_total" integer NOT NULL DEFAULT 0,
  "notes" text,
  "livraison_id" integer,
  "date_debut" timestamp with time zone DEFAULT now() NOT NULL,
  "date_fin" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lignes_pesee" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL REFERENCES "sessions_pesee"("id") ON DELETE CASCADE,
  "numero_passage" integer NOT NULL,
  "nb_sacs" integer NOT NULL DEFAULT 0,
  "poids_brut_kg" numeric(10,3) NOT NULL,
  "tare_kg" numeric(10,3) DEFAULT 0,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "sessions_pesee_coop_numero_idx" ON "sessions_pesee"("cooperative_id","numero_session");
