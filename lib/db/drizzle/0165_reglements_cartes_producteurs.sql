DO $$
BEGIN
  ALTER TYPE "mode_paiement" ADD VALUE IF NOT EXISTS 'carte_producteur';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "statut_reglement_carte_producteur" AS ENUM ('en_attente', 'paye', 'rejete', 'annule');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "reglements_cartes_producteurs" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL,
  "paiement_id" integer NOT NULL,
  "paiement_ligne_id" integer NOT NULL,
  "membre_id" integer NOT NULL,
  "livraison_id" integer,
  "numero_carte_snapshot" varchar(100) NOT NULL,
  "beneficiaire" varchar(200) NOT NULL,
  "montant_fcfa" integer NOT NULL,
  "statut" "statut_reglement_carte_producteur" DEFAULT 'en_attente' NOT NULL,
  "compte_bancaire_id" integer,
  "date_creation" date NOT NULL,
  "date_paiement" date,
  "date_rejet" date,
  "motif_rejet" text,
  "motif_annulation" text,
  "mouvement_banque_id" integer,
  "created_by" integer,
  "paid_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "reglements_cartes_producteurs_paiement_unique"
  ON "reglements_cartes_producteurs" ("paiement_id");

CREATE INDEX IF NOT EXISTS "reglements_cartes_producteurs_cooperative_statut_idx"
  ON "reglements_cartes_producteurs" ("cooperative_id", "statut", "created_at");