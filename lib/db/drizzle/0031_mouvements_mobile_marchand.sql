CREATE TABLE IF NOT EXISTS "mouvements_mobile_marchand" (
	"id" serial PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" varchar(10) NOT NULL,
	"motif" varchar(50) NOT NULL,
	"montant_fcfa" numeric NOT NULL,
	"libelle" varchar(300),
	"reference" varchar(100),
	"date_operation" date NOT NULL,
	"solde_apres_fcfa" numeric,
	"enregistre_par" integer,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
