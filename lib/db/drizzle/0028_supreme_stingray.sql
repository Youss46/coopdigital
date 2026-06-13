CREATE TYPE "public"."expedition_motif_ecart" AS ENUM('evaporation', 'vol', 'erreur_pesee', 'avarie', 'autre');--> statement-breakpoint
CREATE TYPE "public"."expedition_statut" AS ENUM('en_preparation', 'charge', 'en_transit', 'arrive_port', 'receptionne', 'litige');--> statement-breakpoint
CREATE TYPE "public"."expedition_type_vehicule" AS ENUM('propre', 'location');--> statement-breakpoint
CREATE TABLE "lectures_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"lu_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages_internes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"auteur_id" integer,
	"sujet" text NOT NULL,
	"contenu" text NOT NULL,
	"destinataires" text DEFAULT 'tous' NOT NULL,
	"nb_destinataires" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alimentations_caisse_delegue" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"caisse_delegue_id" integer NOT NULL,
	"caisse_source_id" integer,
	"montant_fcfa" numeric(14, 2) NOT NULL,
	"motif" varchar(300),
	"statut" varchar(20) DEFAULT 'confirme' NOT NULL,
	"envoye_par" integer,
	"date_envoi" timestamp with time zone DEFAULT now(),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caisses_delegues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"solde" numeric(14, 2) DEFAULT '0' NOT NULL,
	"plafond" numeric(14, 2),
	"plafond_journalier_fcfa" numeric(14, 2) DEFAULT '0',
	"necessite_validation" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_caisse_delegue" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_delegue_id" integer NOT NULL,
	"type" text NOT NULL,
	"montant_fcfa" numeric(14, 2) NOT NULL,
	"solde_apres_fcfa" numeric(14, 2) NOT NULL,
	"livraison_id" integer,
	"note" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions_membres" (
	"id" serial PRIMARY KEY NOT NULL,
	"mission_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"statut" varchar(20) DEFAULT 'a_faire',
	"gps_collecte" jsonb,
	"photos_collectees" jsonb,
	"notes_agent" text,
	"date_collecte" timestamp with time zone,
	"motif_rejet" text
);
--> statement-breakpoint
CREATE TABLE "missions_terrain" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"titre" text NOT NULL,
	"zone_type" varchar(30) NOT NULL,
	"zone_nom" text NOT NULL,
	"date_prevue" date NOT NULL,
	"agent_id" integer,
	"cree_par" integer,
	"statut" varchar(20) DEFAULT 'planifiee',
	"objectif_parcelles" integer,
	"parcelles_collectees" integer DEFAULT 0,
	"motif_rejet" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages_mission" (
	"id" serial PRIMARY KEY NOT NULL,
	"mission_id" integer,
	"auteur_id" integer,
	"message" text NOT NULL,
	"type" varchar(20) DEFAULT 'commentaire',
	"lu" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "push_subscriptions_user_id_endpoint_unique" UNIQUE("user_id","endpoint")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions_portail" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "push_subscriptions_portail_membre_id_endpoint_unique" UNIQUE("membre_id","endpoint")
);
--> statement-breakpoint
CREATE TABLE "comptes_bancaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"banque" varchar(100) NOT NULL,
	"numero_compte" varchar(50),
	"iban" varchar(50),
	"solde_actuel_fcfa" numeric DEFAULT '0' NOT NULL,
	"solde_mini_alerte_fcfa" numeric DEFAULT '0' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_banque" (
	"id" serial PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" varchar(10) NOT NULL,
	"motif" varchar(50) NOT NULL,
	"montant_fcfa" numeric NOT NULL,
	"libelle" varchar(300),
	"reference" varchar(100),
	"date_operation" date NOT NULL,
	"date_valeur" date,
	"solde_apres_fcfa" numeric,
	"rapproche" boolean DEFAULT false NOT NULL,
	"enregistre_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portail_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"titre" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"lien" varchar(500),
	"lu" boolean DEFAULT false NOT NULL,
	"date_lu" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedition_historique" (
	"id" serial PRIMARY KEY NOT NULL,
	"expedition_id" integer NOT NULL,
	"statut_precedent" varchar(30),
	"statut_nouveau" varchar(30) NOT NULL,
	"date_changement" timestamp with time zone DEFAULT now() NOT NULL,
	"fait_par" integer,
	"notes" text,
	"position_gps" jsonb
);
--> statement-breakpoint
CREATE TABLE "expedition_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"expedition_id" integer NOT NULL,
	"lot_id" integer,
	"membre_id" integer,
	"livraison_id" integer,
	"poids_kg" numeric(12, 2),
	"nombre_sacs" integer,
	"certificat_eudr" varchar(200),
	"parcelle_origine" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "expeditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"numero_expedition" varchar(30) NOT NULL,
	"campagne_id" integer,
	"exercice_id" integer,
	"type_vehicule" "expedition_type_vehicule" NOT NULL,
	"vehicule_id" integer,
	"chauffeur_id" integer,
	"immatriculation" varchar(50),
	"nom_chauffeur" varchar(200),
	"telephone_chauffeur" varchar(30),
	"transporteur" varchar(200),
	"numero_bon_transport" varchar(100),
	"date_depart" timestamp with time zone,
	"lieu_depart" varchar(255) DEFAULT 'Magasin central',
	"poids_charge_kg" numeric(12, 2),
	"nombre_sacs" integer,
	"numero_lots" text,
	"port" varchar(100) NOT NULL,
	"entrepot_destination" varchar(255),
	"exportateur_id" integer,
	"exportateur_nom" varchar(255),
	"numero_contrat_export" varchar(100),
	"heure_estimee_arrivee" timestamp with time zone,
	"position_gps_actuelle" jsonb,
	"date_arrivee_port" timestamp with time zone,
	"poids_recu_port_kg" numeric(12, 2),
	"numero_recepisse_port" varchar(100),
	"nom_receptionnaire" varchar(200),
	"statut_reception" varchar(20),
	"ecart_poids_kg" numeric(12, 2),
	"motif_ecart" "expedition_motif_ecart",
	"provision_litige" boolean DEFAULT false,
	"certificat_phyto_numero" varchar(100),
	"certificat_phyto_date_emission" date,
	"certificat_phyto_date_expiration" date,
	"certificat_phyto_organisme" varchar(200) DEFAULT 'DPVC',
	"documents" jsonb DEFAULT '[]'::jsonb,
	"statut" "expedition_statut" DEFAULT 'en_preparation' NOT NULL,
	"ecriture_depart_id" integer,
	"ecriture_arrivee_id" integer,
	"ecriture_transport_id" integer,
	"ecriture_ecart_id" integer,
	"cree_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expeditions_numero_expedition_unique" UNIQUE("numero_expedition")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'delegue';--> statement-breakpoint
ALTER TABLE "config_cooperative" ALTER COLUMN "logo_url" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents_officiels" ALTER COLUMN "fichier_url" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zone_type" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zone_nom" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zone_villages" text;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "delegue_id" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "rattachement_type" varchar(20) DEFAULT 'delegue';--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "zone_type" varchar(20);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "zone_nom" text;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "cree_par_delegue" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "statut_membre" varchar(20) DEFAULT 'en_attente';--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "cree_par" varchar(30);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "demande_par_delegue_id" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "motif_rejet" text;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "valide_par" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "date_validation" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "carte_producteur" varchar(100);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "telephone_secondaire" varchar(20);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "nombre_parcelles" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "superficie_totale" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "gps_parcelles" jsonb;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "culture_principale" varchar(50);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "polygone_gps" jsonb;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "certification" varchar(50);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "documents_joints" jsonb;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "carte_statut" varchar(20) DEFAULT 'non_emise';--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "carte_numero" varchar(50);--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "carte_genere_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "carte_suspendue_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "completude_fiche" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "completude_identite" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "completude_eudr" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "statut_eudr" varchar(20) DEFAULT 'non_conforme';--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "mission_gps_requise" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "gps_collecte_par" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "gps_valide_par" integer;--> statement-breakpoint
ALTER TABLE "membres" ADD COLUMN "date_collecte_gps" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campagnes" ADD COLUMN "tonnage_cible_kg" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD COLUMN "prix_unitaire_fcfa" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "config_comptable" ADD COLUMN "auto_emprunts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_comptable" ADD COLUMN "auto_transport" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_comptable" ADD COLUMN "auto_investissements" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_comptable" ADD COLUMN "auto_maintenances" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_comptable" ADD COLUMN "auto_intrants" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD COLUMN "statut_agrement" text DEFAULT 'agree';--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD COLUMN "date_agrement" date;--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD COLUMN "date_expiration_agrement" date;--> statement-breakpoint
ALTER TABLE "caisses" ADD COLUMN "type_caisse" varchar(10) DEFAULT 'centrale' NOT NULL;--> statement-breakpoint
ALTER TABLE "lectures_messages" ADD CONSTRAINT "lectures_messages_message_id_messages_internes_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages_internes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures_messages" ADD CONSTRAINT "lectures_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_internes" ADD CONSTRAINT "messages_internes_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_internes" ADD CONSTRAINT "messages_internes_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimentations_caisse_delegue" ADD CONSTRAINT "alimentations_caisse_delegue_caisse_delegue_id_caisses_delegues_id_fk" FOREIGN KEY ("caisse_delegue_id") REFERENCES "public"."caisses_delegues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimentations_caisse_delegue" ADD CONSTRAINT "alimentations_caisse_delegue_caisse_source_id_caisses_id_fk" FOREIGN KEY ("caisse_source_id") REFERENCES "public"."caisses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimentations_caisse_delegue" ADD CONSTRAINT "alimentations_caisse_delegue_envoye_par_users_id_fk" FOREIGN KEY ("envoye_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses_delegues" ADD CONSTRAINT "caisses_delegues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisses_delegues" ADD CONSTRAINT "caisses_delegues_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_caisse_delegue" ADD CONSTRAINT "mouvements_caisse_delegue_caisse_delegue_id_caisses_delegues_id_fk" FOREIGN KEY ("caisse_delegue_id") REFERENCES "public"."caisses_delegues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_caisse_delegue" ADD CONSTRAINT "mouvements_caisse_delegue_livraison_id_livraisons_id_fk" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_caisse_delegue" ADD CONSTRAINT "mouvements_caisse_delegue_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions_terrain" ADD CONSTRAINT "missions_terrain_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_mission" ADD CONSTRAINT "messages_mission_mission_id_missions_terrain_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions_terrain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_mission" ADD CONSTRAINT "messages_mission_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions_portail" ADD CONSTRAINT "push_subscriptions_portail_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_notifications" ADD CONSTRAINT "portail_notifications_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_notifications" ADD CONSTRAINT "portail_notifications_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_historique" ADD CONSTRAINT "expedition_historique_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_lots" ADD CONSTRAINT "expedition_lots_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_lots" ADD CONSTRAINT "expedition_lots_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_lots" ADD CONSTRAINT "expedition_lots_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_lots" ADD CONSTRAINT "expedition_lots_livraison_id_livraisons_id_fk" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_chauffeur_id_chauffeurs_id_fk" FOREIGN KEY ("chauffeur_id") REFERENCES "public"."chauffeurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_exportateur_id_exportateurs_id_fk" FOREIGN KEY ("exportateur_id") REFERENCES "public"."exportateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_sub_portail_membre_idx" ON "push_subscriptions_portail" USING btree ("membre_id");