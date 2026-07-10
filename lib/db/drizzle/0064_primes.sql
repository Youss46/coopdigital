-- Migration 0064 : Module Primes & Redistribution

DO $$ BEGIN
  CREATE TYPE "public"."type_prime" AS ENUM (
    'certification_ra', 'certification_fairtrade', 'certification_bio',
    'qualite', 'fidelite', 'ristourne'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."statut_distribution" AS ENUM ('brouillon', 'validee', 'payee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."statut_prime_membre" AS ENUM ('en_attente', 'paye', 'annule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "primes_receptions" (
  "id"                   serial PRIMARY KEY,
  "cooperative_id"       integer NOT NULL,
  "campagne_id"          integer REFERENCES "campagnes"("id"),
  "type_prime"           "type_prime" NOT NULL,
  "exportateur_id"       integer REFERENCES "exportateurs"("id"),
  "montant_total_fcfa"   integer NOT NULL,
  "date_reception"       date NOT NULL,
  "tonnage_reference_kg" numeric(12, 2),
  "statut"               text NOT NULL DEFAULT 'en_attente',
  "notes"                text,
  "created_by"           integer,
  "created_at"           timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"           timestamptz
);

CREATE TABLE IF NOT EXISTS "primes_distributions" (
  "id"                     serial PRIMARY KEY,
  "cooperative_id"         integer NOT NULL,
  "campagne_id"            integer REFERENCES "campagnes"("id"),
  "prime_reception_id"     integer NOT NULL REFERENCES "primes_receptions"("id") ON DELETE CASCADE,
  "date_distribution"      date NOT NULL,
  "tonnage_total_kg"       numeric(12, 2) NOT NULL,
  "montant_brut_fcfa"      integer NOT NULL,
  "montant_frais_fcfa"     integer NOT NULL DEFAULT 0,
  "montant_distribue_fcfa" integer NOT NULL,
  "statut"                 "statut_distribution" NOT NULL DEFAULT 'brouillon',
  "valide_par"             integer,
  "valide_le"              timestamptz,
  "notes"                  text,
  "created_by"             integer,
  "created_at"             timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"             timestamptz
);

CREATE TABLE IF NOT EXISTS "primes_membres" (
  "id"                     serial PRIMARY KEY,
  "cooperative_id"         integer NOT NULL,
  "distribution_id"        integer NOT NULL REFERENCES "primes_distributions"("id") ON DELETE CASCADE,
  "membre_id"              integer NOT NULL REFERENCES "membres"("id"),
  "tonnage_kg"             numeric(10, 2) NOT NULL,
  "montant_brut_fcfa"      integer NOT NULL,
  "deduction_avances_fcfa" integer NOT NULL DEFAULT 0,
  "deduction_frais_fcfa"   integer NOT NULL DEFAULT 0,
  "montant_net_fcfa"       integer NOT NULL,
  "statut"                 "statut_prime_membre" NOT NULL DEFAULT 'en_attente',
  "mode_paiement"          varchar(30),
  "date_paiement"          date,
  "reference_paiement"     varchar(100),
  "paye_par"               integer,
  "notes"                  text,
  "created_at"             timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_primes_receptions_coop ON "primes_receptions"("cooperative_id");
CREATE INDEX IF NOT EXISTS idx_primes_distributions_coop ON "primes_distributions"("cooperative_id");
CREATE INDEX IF NOT EXISTS idx_primes_membres_distribution ON "primes_membres"("distribution_id");
CREATE INDEX IF NOT EXISTS idx_primes_membres_membre ON "primes_membres"("membre_id");
