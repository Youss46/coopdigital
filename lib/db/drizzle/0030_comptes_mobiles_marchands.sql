CREATE TYPE IF NOT EXISTS "public"."operateur_mobile" AS ENUM('wave', 'orange_money', 'mtn_momo');

CREATE TABLE IF NOT EXISTS "comptes_mobiles_marchands" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"operateur" "operateur_mobile" NOT NULL,
	"numero_marchand" varchar(50),
	"solde_actuel_fcfa" numeric NOT NULL DEFAULT '0',
	"solde_mini_alerte_fcfa" numeric NOT NULL DEFAULT '0',
	"actif" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
