-- La table avait été créée historiquement via drizzle push et n'existait dans
-- aucune migration : une base vierge échouait ici. On la crée si absente
-- (no-op sur les bases existantes) avant de la modifier.
CREATE TABLE IF NOT EXISTS "bons_reception_membres_delegues" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id"),
  "membre_delegue_id" integer NOT NULL REFERENCES "membres"("id"),
  "magasinier_id" integer REFERENCES "users"("id"),
  "statut" text NOT NULL DEFAULT 'en_attente_pesee',
  "poids_declare_kg" numeric(10,2),
  "nombre_sacs_declares" integer,
  "type_transport" text NOT NULL DEFAULT 'externe',
  "vehicule_id" integer REFERENCES "vehicules"("id"),
  "chauffeur_id" integer REFERENCES "chauffeurs"("id"),
  "type_vehicule" text,
  "immatriculation" text,
  "nom_chauffeur" text,
  "telephone_chauffeur" text,
  "frais_carburant_fcfa" integer NOT NULL DEFAULT 0,
  "autres_charges_fcfa" integer NOT NULL DEFAULT 0,
  "autres_charges_libelle" text,
  "notes" text,
  "session_pesee_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Le bon peut désormais être créé par le magasinier ou par un peseur.
ALTER TABLE "bons_reception_membres_delegues"
  ADD COLUMN IF NOT EXISTS "cree_par_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "cree_par_role" text;

-- Les bons existants ont tous été créés depuis le parcours magasinier.
UPDATE "bons_reception_membres_delegues"
SET "cree_par_id" = "magasinier_id",
    "cree_par_role" = 'magasinier'
WHERE "cree_par_id" IS NULL
  AND "magasinier_id" IS NOT NULL;