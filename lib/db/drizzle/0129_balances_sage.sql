-- Import des balances Sage : consultation isolée et reprise par à-nouveaux.
CREATE TABLE IF NOT EXISTS "balance_sage_imports" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL,
  "exercice" integer NOT NULL,
  "mode" varchar(20) NOT NULL,
  "nom_fichier" varchar(255) NOT NULL,
  "empreinte" varchar(64) NOT NULL,
  "feuille" varchar(100) NOT NULL,
  "statut" varchar(30) NOT NULL DEFAULT 'importe',
  "nombre_lignes" integer NOT NULL DEFAULT 0,
  "nombre_erreurs" integer NOT NULL DEFAULT 0,
  "comptes_inconnus" integer NOT NULL DEFAULT 0,
  "compte_contrepartie" varchar(20),
  "date_reprise" date,
  "preparee_par" integer,
  "preparee_le" timestamptz,
  "validee_par" integer,
  "validee_le" timestamptz,
  "nombre_ecritures" integer,
  "cree_par" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "balance_sage_imports_coop_exercice_hash_mode_unique"
    UNIQUE ("cooperative_id", "exercice", "empreinte", "mode")
);

CREATE TABLE IF NOT EXISTS "balance_sage_lignes" (
  "id" serial PRIMARY KEY,
  "import_id" integer NOT NULL,
  "numero_ligne" integer NOT NULL,
  "numero_compte" varchar(20) NOT NULL,
  "libelle" varchar(300) NOT NULL,
  "total_debit" integer NOT NULL DEFAULT 0,
  "total_credit" integer NOT NULL DEFAULT 0,
  "solde_debiteur" integer NOT NULL DEFAULT 0,
  "solde_crediteur" integer NOT NULL DEFAULT 0,
  "compte_connu" boolean NOT NULL DEFAULT false,
  "erreur" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "balance_sage_lignes_import_ligne_unique"
    UNIQUE ("import_id", "numero_ligne")
);

CREATE INDEX IF NOT EXISTS "balance_sage_imports_coop_exercice_idx"
  ON "balance_sage_imports" ("cooperative_id", "exercice");
CREATE INDEX IF NOT EXISTS "balance_sage_lignes_import_id_idx"
  ON "balance_sage_lignes" ("import_id");