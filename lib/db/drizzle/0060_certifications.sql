CREATE TABLE IF NOT EXISTS "certifications" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "type" varchar(50) NOT NULL,
  "nom_certificateur" varchar(200),
  "numero_certificat" varchar(100),
  "date_obtention" date,
  "date_expiration" date,
  "statut" varchar(30) NOT NULL DEFAULT 'actif',
  "superficie_certifiee_ha" numeric(10,2),
  "nb_membres_couverts" integer DEFAULT 0,
  "lien_document" text,
  "notes" text,
  "cree_par" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "audits_certifications" (
  "id" serial PRIMARY KEY,
  "certification_id" integer NOT NULL REFERENCES "certifications"("id") ON DELETE CASCADE,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "action" varchar(50) NOT NULL,
  "ancien_statut" varchar(30),
  "nouveau_statut" varchar(30),
  "notes" text,
  "fait_par" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
