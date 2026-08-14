CREATE TABLE IF NOT EXISTS "depenses_vehicule" (
  "id"              serial PRIMARY KEY NOT NULL,
  "cooperative_id"  integer NOT NULL REFERENCES "cooperatives"("id"),
  "vehicule_id"     integer NOT NULL REFERENCES "vehicules"("id"),
  "mission_id"      integer REFERENCES "missions_transport"("id"),
  "type"            varchar(30) NOT NULL,
  "date_depense"    date NOT NULL,
  "montant_fcfa"    numeric(14,2) NOT NULL,
  "libelle"         varchar(255) NOT NULL,
  "fournisseur"     varchar(255),
  "reference_piece" varchar(100),
  "quantite"        numeric(10,3),
  "unite"           varchar(30),
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL
);
