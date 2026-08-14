CREATE TABLE IF NOT EXISTS "charges_diverses" (
  "id"                serial PRIMARY KEY NOT NULL,
  "cooperative_id"    integer NOT NULL REFERENCES "cooperatives"("id"),
  "date_charge"       date NOT NULL,
  "libelle"           varchar(255) NOT NULL,
  "description"       text,
  "montant_fcfa"      numeric(14,2) NOT NULL,
  "categorie"         varchar(50) NOT NULL DEFAULT 'autre',
  "compte_debit"      varchar(20) NOT NULL DEFAULT '6580',
  "compte_credit"     varchar(20) NOT NULL DEFAULT '571',
  "mode_paiement"     varchar(30) NOT NULL DEFAULT 'especes',
  "tiers"             varchar(255),
  "reference_piece"   varchar(100),
  "statut"            varchar(20) NOT NULL DEFAULT 'brouillon',
  "created_by"        integer REFERENCES "users"("id"),
  "approved_by"       integer REFERENCES "users"("id"),
  "approved_at"       timestamp with time zone,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"        timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "charges_diverses_cooperative_idx" ON "charges_diverses"("cooperative_id");
CREATE INDEX IF NOT EXISTS "charges_diverses_date_idx" ON "charges_diverses"("cooperative_id","date_charge");
