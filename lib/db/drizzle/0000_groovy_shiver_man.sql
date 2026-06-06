CREATE TYPE "public"."membre_statut" AS ENUM('actif', 'inactif');--> statement-breakpoint
CREATE TYPE "public"."cotisation_statut" AS ENUM('paye', 'en_attente', 'partiel');--> statement-breakpoint
CREATE TYPE "public"."avance_statut" AS ENUM('en_cours', 'rembourse', 'en_retard');--> statement-breakpoint
CREATE TYPE "public"."campagne_statut" AS ENUM('ouverte', 'fermee');--> statement-breakpoint
CREATE TYPE "public"."mode_paiement" AS ENUM('orange_money', 'mtn_momo', 'especes');--> statement-breakpoint
CREATE TYPE "public"."paiement_statut" AS ENUM('en_attente', 'confirme', 'echec');--> statement-breakpoint
CREATE TYPE "public"."lot_statut" AS ENUM('en_stock', 'vendu', 'transit');--> statement-breakpoint
CREATE TYPE "public"."mouvement_type" AS ENUM('entree', 'sortie', 'retour_refus', 'declassement', 'perte');--> statement-breakpoint
CREATE TYPE "public"."vente_statut" AS ENUM('en_attente', 'partiel', 'regle', 'en_retard');--> statement-breakpoint
CREATE TYPE "public"."sms_statut" AS ENUM('envoye', 'echec', 'partiel');--> statement-breakpoint
CREATE TYPE "public"."source_ecriture_attente" AS ENUM('livraison', 'paiement', 'avance', 'vente', 'encaissement', 'salaire', 'stock', 'don');--> statement-breakpoint
CREATE TYPE "public"."source_ecriture" AS ENUM('livraison', 'vente', 'avance', 'paiement', 'manuel', 'encaissement', 'salaire', 'stock', 'don');--> statement-breakpoint
CREATE TYPE "public"."statut_ecriture_attente" AS ENUM('en_attente', 'validee', 'rejetee', 'modifiee');--> statement-breakpoint
CREATE TYPE "public"."statut_exercice" AS ENUM('ouvert', 'cloture');--> statement-breakpoint
CREATE TYPE "public"."type_compte" AS ENUM('actif', 'passif', 'charge', 'produit');--> statement-breakpoint
CREATE TYPE "public"."avance_personnel_statut" AS ENUM('en_cours', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."bulletin_statut" AS ENUM('brouillon', 'valide', 'paye');--> statement-breakpoint
CREATE TYPE "public"."composante_calcul" AS ENUM('fixe', 'pourcentage');--> statement-breakpoint
CREATE TYPE "public"."composante_type" AS ENUM('avantage', 'retenue');--> statement-breakpoint
CREATE TYPE "public"."ligne_bulletin_type" AS ENUM('avantage', 'retenue');--> statement-breakpoint
CREATE TYPE "public"."mode_paiement_personnel" AS ENUM('orange_money', 'mtn_momo', 'virement', 'especes');--> statement-breakpoint
CREATE TYPE "public"."personnel_statut" AS ENUM('actif', 'suspendu', 'sorti');--> statement-breakpoint
CREATE TYPE "public"."type_contrat" AS ENUM('cdi', 'cdd', 'journalier', 'stagiaire');--> statement-breakpoint
CREATE TYPE "public"."refus_decision" AS ENUM('retour_stock', 'declassement', 'autre_acheteur', 'perte');--> statement-breakpoint
CREATE TYPE "public"."refus_statut" AS ENUM('en_attente', 'traite');--> statement-breakpoint
CREATE TYPE "public"."fournisseur_type" AS ENUM('membre', 'pisteur', 'externe');--> statement-breakpoint
CREATE TYPE "public"."distribution_mode" AS ENUM('credit', 'gratuit', 'subventionne');--> statement-breakpoint
CREATE TYPE "public"."remboursement_intrant_mode" AS ENUM('deduction_livraison', 'especes', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."remboursement_statut" AS ENUM('non_rembourse', 'partiel', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."echeance_statut" AS ENUM('a_payer', 'paye', 'en_retard');--> statement-breakpoint
CREATE TYPE "public"."emprunt_periodicite" AS ENUM('mensuel', 'trimestriel', 'semestriel', 'annuel', 'in_fine');--> statement-breakpoint
CREATE TYPE "public"."emprunt_statut" AS ENUM('en_cours', 'rembourse', 'en_retard', 'restructure');--> statement-breakpoint
CREATE TYPE "public"."preteur_type" AS ENUM('banque', 'microfinance', 'bailleur', 'prive');--> statement-breakpoint
CREATE TYPE "public"."budget_categorie" AS ENUM('recette', 'charge_achat', 'charge_exploitation', 'charge_personnel', 'charge_financiere', 'investissement');--> statement-breakpoint
CREATE TYPE "public"."budget_statut" AS ENUM('brouillon', 'valide', 'cloture');--> statement-breakpoint
CREATE TYPE "public"."bailleur_type" AS ENUM('ong', 'institution', 'etat', 'prive');--> statement-breakpoint
CREATE TYPE "public"."rapport_statut" AS ENUM('brouillon', 'soumis', 'valide');--> statement-breakpoint
CREATE TYPE "public"."subvention_statut" AS ENUM('en_attente', 'actif', 'cloture', 'suspendu');--> statement-breakpoint
CREATE TYPE "public"."tranche_statut" AS ENUM('attendue', 'recue', 'en_retard');--> statement-breakpoint
CREATE TYPE "public"."ag_statut" AS ENUM('planifiee', 'ouverte', 'cloturee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."ag_type" AS ENUM('ordinaire', 'extraordinaire', 'constitutive');--> statement-breakpoint
CREATE TYPE "public"."canal_convo" AS ENUM('sms', 'whatsapp', 'affichage');--> statement-breakpoint
CREATE TYPE "public"."mode_pres" AS ENUM('physique', 'procuration');--> statement-breakpoint
CREATE TYPE "public"."point_statut" AS ENUM('en_attente', 'en_cours', 'traite');--> statement-breakpoint
CREATE TYPE "public"."point_type" AS ENUM('information', 'deliberation', 'vote', 'election');--> statement-breakpoint
CREATE TYPE "public"."vote_resultat" AS ENUM('adopte', 'rejete', 'nul');--> statement-breakpoint
CREATE TYPE "public"."alerte_prix_type" AS ENUM('marge_faible', 'prix_bas', 'prix_eleve', 'variation_forte');--> statement-breakpoint
CREATE TABLE "cooperatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"email" text NOT NULL,
	"telephone" varchar(20),
	"password_hash" text NOT NULL,
	"role" varchar(30) DEFAULT 'agent_terrain' NOT NULL,
	"section" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "membres" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"numero_cni" text,
	"telephone" text NOT NULL,
	"village" text,
	"groupement" text,
	"superficie_ha" numeric(8, 2) NOT NULL,
	"statut" "membre_statut" DEFAULT 'actif' NOT NULL,
	"qr_code_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"date_adhesion" date NOT NULL,
	"photo_url" text,
	"parcelle_lat" numeric(10, 7),
	"parcelle_lng" numeric(10, 7),
	"sexe" text,
	"date_naissance" date,
	"type_fournisseur" text,
	"section" text,
	"lieu_naissance" text,
	"nationalite" text DEFAULT 'Ivoirienne',
	"nbre_parts_souscrites" integer DEFAULT 0 NOT NULL,
	"valeur_nominale_part_fcfa" integer DEFAULT 0 NOT NULL,
	"total_souscrit_fcfa" integer DEFAULT 0 NOT NULL,
	"total_libere_fcfa" integer DEFAULT 0 NOT NULL,
	"reste_a_liberer_fcfa" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membres_qr_code_token_unique" UNIQUE("qr_code_token")
);
--> statement-breakpoint
CREATE TABLE "cotisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"annee" smallint NOT NULL,
	"statut_paiement" "cotisation_statut" DEFAULT 'en_attente' NOT NULL,
	"date_paiement" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avances" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"montant_octroye_fcfa" integer NOT NULL,
	"montant_rembourse_fcfa" integer DEFAULT 0 NOT NULL,
	"solde_restant_fcfa" integer NOT NULL,
	"date_octroi" date NOT NULL,
	"date_echeance" date,
	"motif" text,
	"statut" "avance_statut" DEFAULT 'en_cours' NOT NULL,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bilans_campagne" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer NOT NULL,
	"tonnage_total_kg" numeric(14, 2) DEFAULT '0',
	"tonnage_membres_kg" numeric(14, 2) DEFAULT '0',
	"tonnage_pisteurs_kg" numeric(14, 2) DEFAULT '0',
	"tonnage_externes_kg" numeric(14, 2) DEFAULT '0',
	"nb_livraisons" integer DEFAULT 0,
	"nb_membres_actifs" integer DEFAULT 0,
	"nb_fournisseurs_total" integer DEFAULT 0,
	"prix_achat_moyen_kg_fcfa" numeric(12, 2) DEFAULT '0',
	"tonnage_vendu_kg" numeric(14, 2) DEFAULT '0',
	"ca_ventes_fcfa" numeric(16, 2) DEFAULT '0',
	"prix_vente_moyen_kg_fcfa" numeric(12, 2) DEFAULT '0',
	"nb_exportateurs" integer DEFAULT 0,
	"creances_restantes_fcfa" numeric(16, 2) DEFAULT '0',
	"cout_achat_total_fcfa" numeric(16, 2) DEFAULT '0',
	"charges_exploitation_fcfa" numeric(16, 2) DEFAULT '0',
	"charges_personnel_fcfa" numeric(16, 2) DEFAULT '0',
	"charges_financieres_fcfa" numeric(16, 2) DEFAULT '0',
	"marge_brute_fcfa" numeric(16, 2) DEFAULT '0',
	"marge_nette_fcfa" numeric(16, 2) DEFAULT '0',
	"marge_kg_fcfa" numeric(12, 2) DEFAULT '0',
	"avances_octroyees_fcfa" numeric(16, 2) DEFAULT '0',
	"avances_remboursees_fcfa" numeric(16, 2) DEFAULT '0',
	"avances_solde_fcfa" numeric(16, 2) DEFAULT '0',
	"intrants_distribues_fcfa" numeric(16, 2) DEFAULT '0',
	"intrants_recouvres_fcfa" numeric(16, 2) DEFAULT '0',
	"parts_sociales_collectees_fcfa" numeric(16, 2) DEFAULT '0',
	"cotisations_collectees_fcfa" numeric(16, 2) DEFAULT '0',
	"variation_tonnage_pct" numeric(8, 2),
	"variation_ca_pct" numeric(8, 2),
	"variation_marge_pct" numeric(8, 2),
	"date_generation" timestamp with time zone DEFAULT now(),
	"genere_par" integer
);
--> statement-breakpoint
CREATE TABLE "campagnes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"annee_debut" integer NOT NULL,
	"annee_fin" integer NOT NULL,
	"date_ouverture" date NOT NULL,
	"date_fermeture" date,
	"statut" "campagne_statut" DEFAULT 'ouverte' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications_cloture" (
	"id" serial PRIMARY KEY NOT NULL,
	"campagne_id" integer NOT NULL,
	"code" varchar(10) NOT NULL,
	"verification" varchar(255) NOT NULL,
	"statut" varchar(20) NOT NULL,
	"message" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livraisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"campagne_id" integer,
	"code_achat" text,
	"produit" text DEFAULT 'cacao',
	"produit_brut_kg" numeric(10, 2),
	"nombre_sacs" integer,
	"retenue_kg" numeric(10, 2) DEFAULT '0',
	"poids_net_kg" numeric(10, 2),
	"type_fournisseur" text,
	"section_livraison" text,
	"poids_kg" numeric(8, 2) NOT NULL,
	"prix_unitaire_fcfa" integer NOT NULL,
	"montant_brut_fcfa" integer NOT NULL,
	"avance_deduite_fcfa" integer DEFAULT 0 NOT NULL,
	"intrants_deduits_fcfa" integer DEFAULT 0 NOT NULL,
	"montant_net_fcfa" integer NOT NULL,
	"date_livraison" date NOT NULL,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"balance_id" integer,
	"peseur_id" integer,
	"poids_brut_1ere_pesee_kg" numeric(10, 3),
	"poids_brut_2eme_pesee_kg" numeric(10, 3),
	"ecart_pesee_kg" numeric(10, 3),
	"ecart_pesee_pct" numeric(6, 3),
	"poids_retenu_kg" numeric(10, 3),
	"double_pesee_requise" boolean DEFAULT false,
	"double_pesee_effectuee" boolean DEFAULT false,
	"litige_pesee" boolean DEFAULT false,
	CONSTRAINT "livraisons_code_achat_unique" UNIQUE("code_achat")
);
--> statement-breakpoint
CREATE TABLE "paiements" (
	"id" serial PRIMARY KEY NOT NULL,
	"livraison_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"campagne_id" integer,
	"numero_recu" text,
	"libelle" text,
	"mode_reglement" text,
	"montant_a_payer_fcfa" numeric(12, 2),
	"montant_verse_fcfa" numeric(12, 2),
	"reste_a_payer_fcfa" numeric(12, 2),
	"montant_fcfa" integer NOT NULL,
	"mode_paiement" "mode_paiement" DEFAULT 'especes' NOT NULL,
	"reference_transaction" text,
	"statut" "paiement_statut" DEFAULT 'en_attente' NOT NULL,
	"recu_envoye_whatsapp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paiements_numero_recu_unique" UNIQUE("numero_recu")
);
--> statement-breakpoint
CREATE TABLE "lot_livraisons" (
	"lot_id" integer NOT NULL,
	"livraison_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"qr_code_lot" uuid DEFAULT gen_random_uuid() NOT NULL,
	"statut" "lot_statut" DEFAULT 'en_stock' NOT NULL,
	"poids_total_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"date_creation" timestamp with time zone DEFAULT now() NOT NULL,
	"entrepot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_qr_code_lot_unique" UNIQUE("qr_code_lot")
);
--> statement-breakpoint
CREATE TABLE "entrepots" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL,
	"capacite_kg" numeric(10, 2) NOT NULL,
	"seuil_alerte_kg" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"entrepot_id" integer NOT NULL,
	"lot_id" integer,
	"type" "mouvement_type" NOT NULL,
	"poids_kg" numeric(10, 2) NOT NULL,
	"motif" text,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exportateurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" text NOT NULL,
	"contact" text,
	"ville" text,
	"agrement_numero" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventes_exportateurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"exportateur_id" integer NOT NULL,
	"lot_id" integer,
	"campagne_id" integer,
	"numero_bon_sortie" text,
	"numero_bon_livraison" text,
	"numero_remorque_camion" text,
	"type_livraison" text,
	"produit" text DEFAULT 'cacao',
	"poids_brut_kg" numeric(10, 2),
	"nombre_sacs_total" integer,
	"nombre_sacs_arrives" integer,
	"nombre_sacs_refoules" integer DEFAULT 0 NOT NULL,
	"nombre_sacs_acceptes" integer,
	"poids_refoule_kg" numeric(10, 2) DEFAULT '0',
	"refaction_kg" numeric(10, 2) DEFAULT '0',
	"poids_net_accepte_kg" numeric(10, 2),
	"pu_mise_en_compte_fcfa" numeric(12, 2),
	"montant_mise_en_compte_fcfa" numeric(14, 2),
	"taux_bic" numeric(5, 2) DEFAULT '0',
	"montant_bic_fcfa" numeric(14, 2),
	"montant_net_a_payer_fcfa" numeric(14, 2),
	"poids_kg" numeric(10, 2) NOT NULL,
	"prix_unitaire_fcfa" integer NOT NULL,
	"montant_total_fcfa" integer NOT NULL,
	"date_vente" date NOT NULL,
	"date_echeance_reglement" date,
	"montant_recu_fcfa" integer DEFAULT 0 NOT NULL,
	"solde_du_fcfa" integer NOT NULL,
	"statut" "vente_statut" DEFAULT 'en_attente' NOT NULL,
	"devise_facturation" text DEFAULT 'XOF' NOT NULL,
	"montant_devise_etrangere" numeric(18, 4),
	"taux_change_applique" numeric(18, 6),
	"montant_fcfa_converti" numeric(16, 2),
	"gain_perte_change_fcfa" numeric(16, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_sms" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"agent_id" integer,
	"message" text NOT NULL,
	"groupement" text,
	"nb_destinataires" integer DEFAULT 0 NOT NULL,
	"nb_envoyes" integer DEFAULT 0 NOT NULL,
	"nb_echecs" integer DEFAULT 0 NOT NULL,
	"statut" "sms_statut" DEFAULT 'envoye' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_comptable" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"auto_livraisons" boolean DEFAULT false NOT NULL,
	"auto_paiements" boolean DEFAULT false NOT NULL,
	"auto_avances" boolean DEFAULT false NOT NULL,
	"auto_ventes_export" boolean DEFAULT false NOT NULL,
	"auto_encaissements" boolean DEFAULT false NOT NULL,
	"auto_salaires" boolean DEFAULT false NOT NULL,
	"auto_stocks" boolean DEFAULT false NOT NULL,
	"auto_dons" boolean DEFAULT false NOT NULL,
	"modifie_par" integer,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ecritures_comptables" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"date_ecriture" date NOT NULL,
	"numero_piece" varchar(50),
	"libelle" varchar(300) NOT NULL,
	"compte_debit" varchar(20) NOT NULL,
	"compte_credit" varchar(20) NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"source" "source_ecriture" NOT NULL,
	"source_id" integer,
	"exercice" integer NOT NULL,
	"type_ecriture" varchar(20) DEFAULT 'normale' NOT NULL,
	"ecriture_source_id" integer,
	"motif_correction" text,
	"corrige_par" integer,
	"corrige_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecritures_en_attente" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"source" "source_ecriture_attente" NOT NULL,
	"source_id" integer,
	"libelle_propose" varchar(300) NOT NULL,
	"compte_debit_propose" varchar(20) NOT NULL,
	"compte_credit_propose" varchar(20) NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"date_proposee" date NOT NULL,
	"statut" "statut_ecriture_attente" DEFAULT 'en_attente' NOT NULL,
	"commentaire_comptable" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"traite_le" timestamp with time zone,
	"traite_par" integer
);
--> statement-breakpoint
CREATE TABLE "exercices" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"annee" integer NOT NULL,
	"statut" "statut_exercice" DEFAULT 'ouvert' NOT NULL,
	"date_ouverture" timestamp with time zone DEFAULT now() NOT NULL,
	"date_cloture" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parametres_comptes_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"module" varchar(50) NOT NULL,
	"operation" varchar(100) NOT NULL,
	"compte_debit" varchar(20) NOT NULL,
	"compte_credit" varchar(20) NOT NULL,
	"libelle_ecriture_auto" varchar(300),
	"actif" boolean DEFAULT true NOT NULL,
	"modifie_par" integer,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_comptable" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"numero_compte" varchar(20) NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"type" "type_compte" NOT NULL,
	"classe" integer,
	"compte_parent" varchar(20),
	"solde_normal" varchar(20) DEFAULT 'debiteur',
	"actif" boolean DEFAULT true NOT NULL,
	"ordre_affichage" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "avances_personnel" (
	"id" serial PRIMARY KEY NOT NULL,
	"personnel_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"montant_fcfa" integer NOT NULL,
	"date_octroi" date NOT NULL,
	"motif" text,
	"statut" "avance_personnel_statut" DEFAULT 'en_cours' NOT NULL,
	"montant_rembourse" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulletins_paie" (
	"id" serial PRIMARY KEY NOT NULL,
	"personnel_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"periode" text NOT NULL,
	"salaire_base_fcfa" integer NOT NULL,
	"total_avantages_fcfa" integer DEFAULT 0 NOT NULL,
	"total_retenues_fcfa" integer DEFAULT 0 NOT NULL,
	"salaire_brut_fcfa" integer NOT NULL,
	"salaire_net_fcfa" integer NOT NULL,
	"charges_cnps_patronale_fcfa" integer DEFAULT 0 NOT NULL,
	"charges_taxe_apprentissage_fcfa" integer DEFAULT 0 NOT NULL,
	"charges_fpc_fcfa" integer DEFAULT 0 NOT NULL,
	"cout_total_employeur_fcfa" integer NOT NULL,
	"statut" "bulletin_statut" DEFAULT 'brouillon' NOT NULL,
	"date_validation" timestamp with time zone,
	"date_paiement" timestamp with time zone,
	"reference_paiement" text,
	"paye_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composantes_salaire" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"type" "composante_type" NOT NULL,
	"calcul" "composante_calcul" DEFAULT 'fixe' NOT NULL,
	"valeur" integer DEFAULT 0 NOT NULL,
	"obligatoire" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lignes_bulletin" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulletin_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"type" "ligne_bulletin_type" NOT NULL,
	"montant_fcfa" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"poste" text NOT NULL,
	"role_systeme" text,
	"type_contrat" "type_contrat" DEFAULT 'cdi' NOT NULL,
	"date_embauche" date NOT NULL,
	"date_fin_contrat" date,
	"salaire_base_fcfa" integer NOT NULL,
	"sursalaire_fcfa" integer DEFAULT 0 NOT NULL,
	"numero_cnps" text,
	"numero_cni" text,
	"mode_paiement" "mode_paiement_personnel" DEFAULT 'especes' NOT NULL,
	"telephone_paiement" text,
	"rib_banque" text,
	"statut" "personnel_statut" DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_parts_sociales" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"valeur_nominale_fcfa" integer DEFAULT 5000 NOT NULL,
	"nbre_parts_min" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liberations_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"membre_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"date_versement" date NOT NULL,
	"code_liberation" text,
	"versement" text,
	"montant_fcfa" integer NOT NULL,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traitements_refus" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"vente_exportateur_id" integer NOT NULL,
	"date_refus" date NOT NULL,
	"poids_refoule_kg" numeric(10, 2) NOT NULL,
	"nombre_sacs_refoules" integer NOT NULL,
	"motif_refus" text,
	"taux_humidite" numeric(5, 2),
	"decision" "refus_decision",
	"entrepot_retour_id" integer,
	"ancien_grade" text,
	"nouveau_grade" text,
	"nouvel_exportateur_id" integer,
	"prix_unitaire_nouveau_fcfa" numeric(12, 2),
	"motif_perte" text,
	"pv_constat" boolean DEFAULT false NOT NULL,
	"statut" "refus_statut" DEFAULT 'en_attente' NOT NULL,
	"traite_par" integer,
	"traite_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type_fournisseur" "fournisseur_type" NOT NULL,
	"membre_id" integer,
	"code" text,
	"nom" text NOT NULL,
	"prenoms" text,
	"sexe" text,
	"date_naissance" date,
	"lieu_naissance" text,
	"nationalite" text DEFAULT 'Ivoirienne',
	"numero_cni" text,
	"telephone" text,
	"section" text,
	"origine" text,
	"date_adhesion" date,
	"photo_url" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fournisseurs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "approvisionnements_intrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"intrant_id" integer NOT NULL,
	"campagne_id" integer,
	"date_appro" date NOT NULL,
	"quantite" numeric(12, 3) NOT NULL,
	"prix_unitaire_fcfa" numeric(12, 2) NOT NULL,
	"montant_total_fcfa" numeric(14, 2) NOT NULL,
	"fournisseur" text,
	"numero_facture" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories_intrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"unite" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributions_intrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"intrant_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"campagne_id" integer,
	"date_distribution" date NOT NULL,
	"quantite" numeric(12, 3) NOT NULL,
	"prix_unitaire_fcfa" numeric(12, 2) NOT NULL,
	"montant_fcfa" numeric(14, 2) NOT NULL,
	"mode" "distribution_mode" DEFAULT 'credit' NOT NULL,
	"taux_subvention_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"montant_membre_fcfa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"statut_remboursement" "remboursement_statut" DEFAULT 'non_rembourse' NOT NULL,
	"montant_rembourse_fcfa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"categorie_id" integer,
	"nom" text NOT NULL,
	"description" text,
	"unite" text NOT NULL,
	"prix_unitaire_fcfa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"stock_actuel" numeric(12, 3) DEFAULT '0' NOT NULL,
	"stock_minimum" numeric(12, 3) DEFAULT '0' NOT NULL,
	"fournisseur_intrant" text,
	"date_peremption" date,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remboursements_intrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"distribution_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"date_remboursement" date NOT NULL,
	"montant_fcfa" numeric(14, 2) NOT NULL,
	"mode" "remboursement_intrant_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "echeancier_emprunts" (
	"id" serial PRIMARY KEY NOT NULL,
	"emprunt_id" integer NOT NULL,
	"numero_echeance" integer NOT NULL,
	"date_echeance" date NOT NULL,
	"capital_fcfa" numeric(16, 2) NOT NULL,
	"interet_fcfa" numeric(16, 2) NOT NULL,
	"total_echeance_fcfa" numeric(16, 2) NOT NULL,
	"statut" "echeance_statut" DEFAULT 'a_payer' NOT NULL,
	"date_paiement" date,
	"reference_paiement" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emprunts" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"preteur_id" integer NOT NULL,
	"libelle" varchar(300) NOT NULL,
	"montant_fcfa" numeric(16, 2) NOT NULL,
	"taux_interet_annuel_pct" numeric(7, 4) NOT NULL,
	"duree_mois" integer NOT NULL,
	"date_debut" date NOT NULL,
	"date_echeance" date NOT NULL,
	"periodicite" "emprunt_periodicite" DEFAULT 'mensuel' NOT NULL,
	"montant_rembourse_fcfa" numeric(16, 2) DEFAULT '0' NOT NULL,
	"solde_restant_fcfa" numeric(16, 2) NOT NULL,
	"statut" "emprunt_statut" DEFAULT 'en_cours' NOT NULL,
	"objet" varchar(300),
	"garantie" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preteurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" "preteur_type" DEFAULT 'banque' NOT NULL,
	"nom" varchar(200) NOT NULL,
	"contact" varchar(200),
	"ville" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remboursements_emprunts" (
	"id" serial PRIMARY KEY NOT NULL,
	"emprunt_id" integer NOT NULL,
	"echeance_id" integer,
	"date_remboursement" date NOT NULL,
	"montant_capital_fcfa" numeric(16, 2) DEFAULT '0' NOT NULL,
	"montant_interet_fcfa" numeric(16, 2) DEFAULT '0' NOT NULL,
	"montant_total_fcfa" numeric(16, 2) NOT NULL,
	"mode_paiement" varchar(100),
	"reference" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devises" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"libelle" varchar(100) NOT NULL,
	"symbole" varchar(10) NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "devises_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "taux_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"devise_source" varchar(10) NOT NULL,
	"devise_cible" varchar(10) DEFAULT 'XOF' NOT NULL,
	"taux" numeric(18, 6) NOT NULL,
	"date_application" date NOT NULL,
	"source_taux" varchar(50) DEFAULT 'manuel' NOT NULL,
	"saisi_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets_campagne" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer NOT NULL,
	"statut" "budget_statut" DEFAULT 'brouillon' NOT NULL,
	"valide_par" integer,
	"date_validation" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypotheses_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"tonnage_previsionnel_kg" numeric(14, 2),
	"prix_achat_moyen_fcfa" numeric(10, 2),
	"prix_vente_moyen_fcfa" numeric(10, 2),
	"nb_membres_actifs" integer,
	"nb_livraisons_estimees" integer,
	"marge_brute_estimee_fcfa" numeric(16, 2)
);
--> statement-breakpoint
CREATE TABLE "lignes_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"categorie" "budget_categorie" NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"montant_previsionnel_fcfa" numeric(16, 2) DEFAULT '0' NOT NULL,
	"montant_realise_fcfa" numeric(16, 2) DEFAULT '0' NOT NULL,
	"ecart_fcfa" numeric(16, 2),
	"ecart_pct" numeric(8, 4),
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bailleurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"type" "bailleur_type" DEFAULT 'ong' NOT NULL,
	"pays" varchar(100),
	"contact_nom" varchar(150),
	"contact_email" varchar(200),
	"contact_telephone" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lignes_budget_subvention" (
	"id" serial PRIMARY KEY NOT NULL,
	"subvention_id" integer NOT NULL,
	"poste_budgetaire" varchar(150) NOT NULL,
	"montant_alloue_fcfa" numeric(18, 2) DEFAULT '0' NOT NULL,
	"montant_utilise_fcfa" numeric(18, 2) DEFAULT '0' NOT NULL,
	"justificatif_url" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "rapports_bailleurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subvention_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"periode" varchar(50),
	"type_rapport" varchar(30),
	"statut" "rapport_statut" DEFAULT 'brouillon' NOT NULL,
	"date_soumission" date,
	"contenu_json" jsonb,
	"pdf_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subventions" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"bailleur_id" integer NOT NULL,
	"reference" varchar(100) NOT NULL,
	"libelle" varchar(300) NOT NULL,
	"montant_total_fcfa" numeric(18, 2) NOT NULL,
	"montant_recu_fcfa" numeric(18, 2) DEFAULT '0' NOT NULL,
	"montant_solde_fcfa" numeric(18, 2) DEFAULT '0' NOT NULL,
	"devise_origine" varchar(10) DEFAULT 'XOF' NOT NULL,
	"montant_devise_origine" numeric(18, 4),
	"date_convention" date,
	"date_debut" date,
	"date_fin" date,
	"statut" "subvention_statut" DEFAULT 'en_attente' NOT NULL,
	"conditions" text,
	"rapport_requis" boolean DEFAULT true NOT NULL,
	"periodicite_rapport" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tranches_subvention" (
	"id" serial PRIMARY KEY NOT NULL,
	"subvention_id" integer NOT NULL,
	"numero_tranche" integer NOT NULL,
	"montant_fcfa" numeric(18, 2) NOT NULL,
	"date_prevue" date,
	"date_recue" date,
	"statut" "tranche_statut" DEFAULT 'attendue' NOT NULL,
	"reference_virement" varchar(150),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assemblees_generales" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" "ag_type" DEFAULT 'ordinaire' NOT NULL,
	"libelle" varchar(300) NOT NULL,
	"date_ag" date NOT NULL,
	"heure_debut" time,
	"heure_fin" time,
	"lieu" varchar(300),
	"ordre_du_jour" text[],
	"quorum_requis_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"nb_membres_convoques" integer DEFAULT 0,
	"nb_membres_presents" integer DEFAULT 0 NOT NULL,
	"quorum_atteint" boolean DEFAULT false NOT NULL,
	"statut" "ag_statut" DEFAULT 'planifiee' NOT NULL,
	"pv_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convocations_ag" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_id" integer NOT NULL,
	"canal" "canal_convo" DEFAULT 'sms' NOT NULL,
	"date_envoi" timestamp with time zone DEFAULT now() NOT NULL,
	"nb_envoyes" integer DEFAULT 0 NOT NULL,
	"nb_recus" integer DEFAULT 0 NOT NULL,
	"message_envoye" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ordre_du_jour" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"intitule" varchar(500) NOT NULL,
	"type" "point_type" DEFAULT 'information' NOT NULL,
	"rapporteur" varchar(200),
	"duree_minutes" integer,
	"statut" "point_statut" DEFAULT 'en_attente' NOT NULL,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presences_ag" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"mode_presence" "mode_pres" DEFAULT 'physique' NOT NULL,
	"mandataire_id" integer,
	"heure_arrivee" timestamp with time zone,
	"emargement_numerique" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes_ag" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_id" integer NOT NULL,
	"point_id" integer NOT NULL,
	"intitule_resolution" varchar(500) NOT NULL,
	"nb_pour" integer DEFAULT 0 NOT NULL,
	"nb_contre" integer DEFAULT 0 NOT NULL,
	"nb_abstention" integer DEFAULT 0 NOT NULL,
	"nb_votants" integer DEFAULT 0 NOT NULL,
	"resultat" "vote_resultat" DEFAULT 'nul' NOT NULL,
	"pourcentage_pour" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertes_prix" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" "alerte_prix_type" NOT NULL,
	"seuil_configure" numeric(12, 2),
	"valeur_declenchante" numeric(12, 2),
	"message" varchar(500),
	"lu" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_prix" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"seuil_marge_minimum_fcfa" numeric(12, 2) DEFAULT '100',
	"seuil_variation_alerte_pct" numeric(5, 2) DEFAULT '10',
	"diffusion_auto_sms" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_prix" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"date_prix" date NOT NULL,
	"prix_bord_champ_fcfa" numeric(12, 2) NOT NULL,
	"prix_vente_export_fcfa" numeric(12, 2) NOT NULL,
	"marge_brute_kg_fcfa" numeric(12, 2),
	"source" varchar(100) DEFAULT 'manuel',
	"saisi_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_scoring" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"poids_volume_pct" numeric(5, 2) DEFAULT '30' NOT NULL,
	"poids_qualite_pct" numeric(5, 2) DEFAULT '25' NOT NULL,
	"poids_regularite_pct" numeric(5, 2) DEFAULT '20' NOT NULL,
	"poids_remboursement_pct" numeric(5, 2) DEFAULT '15' NOT NULL,
	"poids_fidelite_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"poids_cotisation_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"seuil_bronze" numeric(5, 2) DEFAULT '40' NOT NULL,
	"seuil_argent" numeric(5, 2) DEFAULT '60' NOT NULL,
	"seuil_or" numeric(5, 2) DEFAULT '75' NOT NULL,
	"seuil_platine" numeric(5, 2) DEFAULT '90' NOT NULL,
	"avantages_bronze" text,
	"avantages_argent" text,
	"avantages_or" text,
	"avantages_platine" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores_membres" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"campagne_id" integer NOT NULL,
	"score_volume" numeric(6, 2),
	"score_qualite" numeric(6, 2),
	"score_regularite" numeric(6, 2),
	"score_remboursement" numeric(6, 2),
	"score_fidelite" numeric(6, 2),
	"score_cotisation" numeric(6, 2),
	"score_global" numeric(6, 2),
	"niveau" varchar(20),
	"rang" integer,
	"date_calcul" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type_anomalie" varchar(100) NOT NULL,
	"niveau_gravite" varchar(20) NOT NULL,
	"module_source" varchar(50) NOT NULL,
	"entite_id" integer,
	"entite_type" varchar(50),
	"description" varchar(500) NOT NULL,
	"valeur_detectee" numeric,
	"seuil_configure" numeric,
	"agent_id" integer,
	"membre_id" integer,
	"statut" varchar(20) DEFAULT 'nouvelle' NOT NULL,
	"traite_par" integer,
	"traite_le" timestamp with time zone,
	"commentaire_traitement" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"poids_max_livraison_kg" numeric DEFAULT '5000',
	"poids_moyen_multiplicateur" numeric DEFAULT '3',
	"delai_min_entre_livraisons_h" integer DEFAULT 12,
	"avance_max_fcfa" numeric DEFAULT '500000',
	"avance_si_retard_existant" boolean DEFAULT true,
	"sortie_max_pct_stock" numeric DEFAULT '80',
	"paiement_sans_livraison" boolean DEFAULT true,
	"doublon_paiement_delai_h" integer DEFAULT 24,
	"ecriture_montant_max_fcfa" numeric DEFAULT '10000000',
	"ecart_reconciliation_pct" numeric DEFAULT '1',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cooperative_id" integer,
	"user_id" integer,
	"user_nom" varchar(255),
	"user_role" varchar(100),
	"user_ip" varchar(100),
	"user_agent" varchar(500),
	"action" varchar(50) NOT NULL,
	"module" varchar(100) NOT NULL,
	"entite_type" varchar(100),
	"entite_id" integer,
	"valeurs_avant" jsonb,
	"valeurs_apres" jsonb,
	"champs_modifies" text[],
	"description" varchar(500),
	"ip_address" "inet",
	"session_id" varchar(255),
	"campagne_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_utilisateurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer,
	"user_id" integer NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"ip_address" "inet",
	"user_agent" varchar(500),
	"date_connexion" timestamp DEFAULT now() NOT NULL,
	"date_deconnexion" timestamp,
	"duree_session_min" integer,
	"nb_actions" integer DEFAULT 0 NOT NULL,
	"statut" varchar(20) DEFAULT 'active' NOT NULL,
	CONSTRAINT "sessions_utilisateurs_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"titre" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"lien" varchar(500),
	"lien_libelle" varchar(100),
	"gravite" varchar(20) DEFAULT 'info' NOT NULL,
	"lu" boolean DEFAULT false NOT NULL,
	"date_lu" timestamp with time zone,
	"source_module" varchar(50),
	"source_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cooperative_id" integer,
	"notif_stock_faible" boolean DEFAULT true NOT NULL,
	"notif_avance_retard" boolean DEFAULT true NOT NULL,
	"notif_creance_retard" boolean DEFAULT true NOT NULL,
	"notif_refus_non_traite" boolean DEFAULT true NOT NULL,
	"notif_anomalie_critique" boolean DEFAULT true NOT NULL,
	"notif_certification_expiration" boolean DEFAULT true NOT NULL,
	"notif_echeance_emprunt" boolean DEFAULT true NOT NULL,
	"notif_bulletin_attente" boolean DEFAULT true NOT NULL,
	"notif_ecriture_attente" boolean DEFAULT true NOT NULL,
	"notif_ag_planifiee" boolean DEFAULT true NOT NULL,
	"notif_message_recu" boolean DEFAULT true NOT NULL,
	"notif_budget_depasse" boolean DEFAULT true NOT NULL,
	"notif_prix_change" boolean DEFAULT true NOT NULL,
	"recevoir_sms" boolean DEFAULT false NOT NULL,
	"recevoir_email" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_cooperative" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom_complet" varchar(255),
	"nom_abrege" varchar(100),
	"logo_url" varchar(500),
	"slogan" varchar(255),
	"adresse" varchar(255),
	"ville" varchar(100),
	"region" varchar(100),
	"pays" varchar(100) DEFAULT 'Côte d''Ivoire',
	"telephone" varchar(30),
	"telephone2" varchar(30),
	"email" varchar(255),
	"site_web" varchar(255),
	"boite_postale" varchar(50),
	"numero_agrement" varchar(100),
	"date_agrement" date,
	"autorite_agrement" varchar(255),
	"forme_juridique" varchar(100) DEFAULT 'Coopérative agricole',
	"numero_rccm" varchar(100),
	"numero_contribuable" varchar(100),
	"date_creation" date,
	"banque_principale" varchar(255),
	"numero_compte_bancaire" varchar(100),
	"iban" varchar(50),
	"swift" varchar(20),
	"devise" varchar(10) DEFAULT 'XOF',
	"exercice_fiscal_debut_mois" integer DEFAULT 1,
	"produit_principal" varchar(50) DEFAULT 'Cacao',
	"zone_collecte" varchar(255),
	"superficie_totale_ha" numeric(12, 2),
	"valeur_nominale_part_fcfa" numeric(12, 2) DEFAULT '5000',
	"nbre_parts_min" integer DEFAULT 5,
	"cotisation_annuelle_fcfa" numeric(12, 2),
	"quorum_ag_pct" numeric(5, 2) DEFAULT '50',
	"couleur_primaire" varchar(20) DEFAULT '#1a4731',
	"couleur_secondaire" varchar(20) DEFAULT '#c4962a',
	"pied_de_page_pdf" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "documents_officiels" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"libelle" varchar(255) NOT NULL,
	"fichier_url" varchar(500) NOT NULL,
	"date_document" date,
	"date_expiration" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chauffeurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(100) NOT NULL,
	"prenoms" varchar(200),
	"telephone" varchar(30),
	"numero_permis" varchar(100),
	"categorie_permis" varchar(10),
	"date_expiration_permis" date,
	"date_embauche" date,
	"statut" varchar(10) DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entretiens_vehicule" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicule_id" integer NOT NULL,
	"type_entretien" varchar(50) NOT NULL,
	"date_entretien" date NOT NULL,
	"kilometrage_entretien" integer,
	"description" text,
	"cout_fcfa" numeric(12, 2),
	"garage" varchar(255),
	"prochain_entretien_km" integer,
	"prochain_entretien_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions_transport" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"vehicule_id" integer NOT NULL,
	"chauffeur_id" integer NOT NULL,
	"campagne_id" integer,
	"type_mission" varchar(20) NOT NULL,
	"zone_collecte" varchar(255),
	"section" varchar(255),
	"vente_exportateur_id" integer,
	"exportateur_destination" varchar(255),
	"lieu_depart" varchar(255) NOT NULL,
	"lieu_arrivee" varchar(255) NOT NULL,
	"date_depart" timestamp with time zone NOT NULL,
	"date_arrivee_prevue" timestamp with time zone,
	"date_arrivee_reelle" timestamp with time zone,
	"poids_charge_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"nombre_sacs" integer DEFAULT 0 NOT NULL,
	"kilometrage_depart" integer,
	"kilometrage_arrivee" integer,
	"distance_km" integer,
	"cout_carburant_fcfa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cout_chauffeur_fcfa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cout_peage_fcfa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cout_divers_fcfa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cout_total_fcfa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cout_par_kg_fcfa" numeric(10, 4),
	"statut" varchar(20) DEFAULT 'planifiee' NOT NULL,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"immatriculation" varchar(50) NOT NULL,
	"marque" varchar(100),
	"modele" varchar(100),
	"type" varchar(20) NOT NULL,
	"capacite_kg" numeric(10, 2),
	"annee_fabrication" integer,
	"date_acquisition" date,
	"valeur_acquisition_fcfa" numeric(14, 2),
	"proprietaire" varchar(20) DEFAULT 'cooperative' NOT NULL,
	"nom_prestataire" varchar(255),
	"statut" varchar(20) DEFAULT 'disponible' NOT NULL,
	"kilometrage_actuel" integer DEFAULT 0 NOT NULL,
	"prochain_entretien_km" integer,
	"prochain_entretien_date" date,
	"assurance_expiration" date,
	"visite_technique_expiration" date,
	"photo_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"numero_serie" varchar(100),
	"marque" varchar(100),
	"capacite_max_kg" numeric(10, 2),
	"precision_g" numeric(8, 1),
	"site" varchar(200),
	"date_acquisition" date,
	"date_derniere_verification" date,
	"date_prochaine_verification" date,
	"statut" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_pesee" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"ecart_max_autorise_pct" numeric(5, 2) DEFAULT '2',
	"seuil_double_pesee_kg" numeric(10, 2) DEFAULT '500',
	"tolerance_balance_g" numeric(8, 1) DEFAULT '500',
	"frequence_verification_jours" integer DEFAULT 90,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "litiges_pesee" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"livraison_id" integer NOT NULL,
	"membre_id" integer,
	"date_litige" date NOT NULL,
	"poids_conteste_kg" numeric(10, 3),
	"poids_revendique_membre_kg" numeric(10, 3),
	"motif" varchar(500),
	"statut" varchar(30) DEFAULT 'ouvert' NOT NULL,
	"decision" text,
	"poids_final_retenu_kg" numeric(10, 3),
	"difference_fcfa" numeric(12, 0),
	"resolu_par" integer,
	"resolu_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"balance_id" integer NOT NULL,
	"date_verification" date NOT NULL,
	"verificateur" varchar(200),
	"resultat" varchar(30) DEFAULT 'conforme' NOT NULL,
	"ecart_mesure_g" numeric(8, 1),
	"observations" text,
	"prochaine_verification" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories_equipements" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"duree_amortissement_ans" integer DEFAULT 5 NOT NULL,
	"methode_amortissement" varchar(20) DEFAULT 'lineaire' NOT NULL,
	"compte_immobilisation" varchar(10) DEFAULT '244' NOT NULL,
	"compte_amortissement" varchar(10) DEFAULT '284' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dotations_amortissement" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipement_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"exercice" integer NOT NULL,
	"mois" integer NOT NULL,
	"dotation_fcfa" numeric(14, 0) NOT NULL,
	"cumul_fcfa" numeric(14, 0) NOT NULL,
	"vnc_fcfa" numeric(14, 0) NOT NULL,
	"ecriture_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipements" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"categorie_id" integer NOT NULL,
	"designation" varchar(300) NOT NULL,
	"marque" varchar(100),
	"modele" varchar(100),
	"numero_serie" varchar(100),
	"date_acquisition" date NOT NULL,
	"valeur_acquisition_fcfa" numeric(14, 0) NOT NULL,
	"valeur_residuelle_fcfa" numeric(14, 0) DEFAULT '0' NOT NULL,
	"duree_amortissement_ans" integer NOT NULL,
	"methode_amortissement" varchar(20) DEFAULT 'lineaire' NOT NULL,
	"valeur_nette_comptable_fcfa" numeric(14, 0) NOT NULL,
	"cumul_amortissement_fcfa" numeric(14, 0) DEFAULT '0' NOT NULL,
	"statut" varchar(20) DEFAULT 'actif' NOT NULL,
	"affecte_a" varchar(200),
	"affecte_user_id" integer,
	"date_mise_service" date,
	"garantie_expiration" date,
	"photo_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenances_equipement" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipement_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'preventive' NOT NULL,
	"date_maintenance" date NOT NULL,
	"description" text,
	"cout_fcfa" numeric(14, 0),
	"prestataire" varchar(200),
	"prochaine_maintenance" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "previsions_campagne" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer NOT NULL,
	"tonnage_prevu_kg" numeric(14, 2),
	"prix_achat_prevu_fcfa" numeric(12, 0),
	"prix_vente_prevu_fcfa" numeric(12, 0),
	"nb_membres_prevus" integer,
	"nb_semaines_campagne" integer,
	"ca_prevu_fcfa" numeric(16, 0),
	"cout_achat_prevu_fcfa" numeric(16, 0),
	"marge_brute_prevue_fcfa" numeric(16, 0),
	"marge_kg_prevue_fcfa" numeric(10, 0),
	"tonnage_rythme_actuel_kg" numeric(14, 2),
	"ca_projection_fin_fcfa" numeric(16, 0),
	"marge_projection_fin_fcfa" numeric(16, 0),
	"ecart_tonnage_pct" numeric(8, 2),
	"ecart_ca_pct" numeric(8, 2),
	"date_derniere_projection" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"nom_simulation" varchar(200) NOT NULL,
	"type" varchar(20) DEFAULT 'mix' NOT NULL,
	"parametres" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_licences" (
	"id" serial PRIMARY KEY NOT NULL,
	"licence_id" integer,
	"cooperative_id" integer,
	"action" varchar(50) NOT NULL,
	"ancien_statut" varchar(20),
	"nouveau_statut" varchar(20),
	"details" jsonb,
	"effectue_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licences" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer,
	"plan_id" integer,
	"cle_licence" varchar(40) NOT NULL,
	"duree_ans" integer NOT NULL,
	"date_activation" date,
	"date_expiration" date,
	"renouvellement_auto" boolean DEFAULT false NOT NULL,
	"date_dernier_renouvellement" date,
	"nb_renouvellements" integer DEFAULT 0 NOT NULL,
	"trial_actif" boolean DEFAULT false NOT NULL,
	"duree_trial_jours" integer DEFAULT 30 NOT NULL,
	"date_fin_trial" date,
	"statut" varchar(20) DEFAULT 'inactive' NOT NULL,
	"motif_suspension" text,
	"date_suspension" timestamp with time zone,
	"suspendu_par" integer,
	"motif_suppression" text,
	"date_suppression" timestamp with time zone,
	"supprime_par" integer,
	"donnees_archivees" boolean DEFAULT false NOT NULL,
	"montant_paye_fcfa" numeric(12, 2),
	"mode_paiement" varchar(50),
	"reference_paiement" varchar(100),
	"facture_url" varchar(500),
	"cree_par" integer,
	"notes_internes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licences_cle_licence_unique" UNIQUE("cle_licence")
);
--> statement-breakpoint
CREATE TABLE "m15_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'support' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m15_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "plans_abonnement" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(50) NOT NULL,
	"prix_1an_fcfa" numeric(12, 2),
	"prix_2ans_fcfa" numeric(12, 2),
	"prix_3ans_fcfa" numeric(12, 2),
	"prix_5ans_fcfa" numeric(12, 2),
	"nb_membres_max" integer,
	"nb_users_max" integer,
	"modules_inclus" text[],
	"stockage_go" integer,
	"support" varchar(50),
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_rendements" (
	"id" serial PRIMARY KEY NOT NULL,
	"parcelle_id" integer NOT NULL,
	"campagne_id" integer,
	"poids_kg" numeric(10, 2),
	"superficie_ha" numeric(10, 4),
	"rendement_kg_ha" numeric(10, 2),
	"qualite_moyenne" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parcelles" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"code_parcelle" varchar,
	"nom_parcelle" varchar,
	"village" varchar,
	"section" varchar,
	"region" varchar,
	"coordonnees_point" jsonb,
	"polygone" jsonb,
	"superficie_declaree_ha" numeric(10, 4),
	"superficie_calculee_ha" numeric(10, 4),
	"culture_principale" varchar,
	"culture_secondaire" varchar,
	"annee_plantation" integer,
	"variete" varchar,
	"eudr_statut" varchar DEFAULT 'non_verifie',
	"eudr_date_verification" date,
	"eudr_risque_deforestation" varchar DEFAULT 'inconnu',
	"eudr_dans_zone_protegee" boolean DEFAULT false,
	"eudr_commentaire" text,
	"certification_statut" varchar,
	"organisme_certificateur" varchar,
	"date_certification" date,
	"date_expiration_cert" date,
	"numero_certificat" varchar,
	"rendement_moyen_kg_ha" numeric(10, 2),
	"derniere_campagne_kg" numeric(10, 2),
	"actif" boolean DEFAULT true,
	"date_enregistrement" date,
	"enregistre_par" integer,
	"photo_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "parcelles_code_parcelle_unique" UNIQUE("code_parcelle")
);
--> statement-breakpoint
CREATE TABLE "zones_risque_eudr" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom_zone" varchar NOT NULL,
	"type_zone" varchar NOT NULL,
	"polygone_zone" jsonb NOT NULL,
	"source" varchar,
	"date_import" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "formations_rse" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"titre" varchar,
	"thematique" varchar,
	"date_formation" date,
	"lieu" varchar,
	"formateur" varchar,
	"nb_participants" integer,
	"nb_femmes" integer,
	"duree_jours" numeric(4, 1),
	"financement" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "indicateurs_rse" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer NOT NULL,
	"nb_membres_total" integer,
	"nb_membres_femmes" integer,
	"nb_membres_jeunes" integer,
	"pct_femmes" numeric(5, 2),
	"revenu_moyen_membre_fcfa" numeric,
	"revenu_median_membre_fcfa" numeric,
	"revenu_min_membre_fcfa" numeric,
	"revenu_max_membre_fcfa" numeric,
	"seuil_pauvrete_fcfa" numeric DEFAULT '750000',
	"nb_membres_sous_seuil" integer,
	"pct_membres_sous_seuil" numeric(5, 2),
	"nb_formations_dispensees" integer DEFAULT 0,
	"nb_beneficiaires_formation" integer DEFAULT 0,
	"thematiques_formation" text[],
	"nb_jours_formation" integer DEFAULT 0,
	"superficie_totale_ha" numeric,
	"superficie_certifiee_ha" numeric,
	"pct_superficie_certifiee" numeric(5, 2),
	"superficie_sous_ombrage_ha" numeric,
	"nb_arbres_plantes" integer DEFAULT 0,
	"superficie_deforestation_evitee_ha" numeric DEFAULT '0',
	"nb_parcelles_conformes_eudr" integer,
	"pct_conformite_eudr" numeric(5, 2),
	"nb_membres_certifies_utz" integer DEFAULT 0,
	"nb_membres_certifies_rainforest" integer DEFAULT 0,
	"nb_membres_certifies_fairtrade" integer DEFAULT 0,
	"nb_membres_certifies_eudr" integer DEFAULT 0,
	"pct_membres_certifies" numeric(5, 2),
	"prix_moyen_paye_kg_fcfa" numeric,
	"prime_qualite_distribuee_fcfa" numeric DEFAULT '0',
	"prime_certification_fcfa" numeric DEFAULT '0',
	"subventions_intrants_fcfa" numeric DEFAULT '0',
	"taux_remboursement_avances_pct" numeric(5, 2),
	"nb_ag_tenues" integer DEFAULT 0,
	"taux_participation_ag_pct" numeric(5, 2) DEFAULT '0',
	"engagements_campagne_suivante" text,
	"date_calcul" timestamp,
	"calcule_par" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories_dons" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"sens" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dons" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"sens" varchar(20) NOT NULL,
	"forme" varchar(20) NOT NULL,
	"categorie_id" integer,
	"reference" varchar(50),
	"libelle" varchar(300) NOT NULL,
	"description" text,
	"date_don" date NOT NULL,
	"beneficiaire_type" varchar(50),
	"beneficiaire_membre_id" integer,
	"beneficiaire_nom" varchar(200),
	"beneficiaire_village" varchar(200),
	"beneficiaire_contact" varchar(100),
	"donateur_type" varchar(50),
	"donateur_nom" varchar(200),
	"donateur_contact" varchar(100),
	"montant_fcfa" numeric DEFAULT '0',
	"valeur_estimee_fcfa" numeric DEFAULT '0',
	"statut" varchar(20) DEFAULT 'brouillon' NOT NULL,
	"valide_par" integer,
	"date_validation" timestamp with time zone,
	"motif_annulation" text,
	"pv_remise" boolean DEFAULT false,
	"pv_url" varchar(500),
	"photo_url" varchar(500),
	"ecriture_generee" boolean DEFAULT false,
	"enregistre_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "dons_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "lignes_don_nature" (
	"id" serial PRIMARY KEY NOT NULL,
	"don_id" integer NOT NULL,
	"designation" varchar(300) NOT NULL,
	"quantite" numeric NOT NULL,
	"unite" varchar(50) NOT NULL,
	"valeur_unitaire_fcfa" numeric NOT NULL,
	"valeur_totale_fcfa" numeric GENERATED ALWAYS AS (quantite * valeur_unitaire_fcfa) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programme_dons" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"libelle" varchar(300) NOT NULL,
	"description" text,
	"budget_alloue_fcfa" numeric NOT NULL,
	"budget_utilise_fcfa" numeric DEFAULT '0',
	"date_debut" date,
	"date_fin" date,
	"statut" varchar(20) DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_collecte" (
	"id" serial PRIMARY KEY NOT NULL,
	"planning_id" integer NOT NULL,
	"membre_id" integer,
	"telephone" varchar(30),
	"message_envoye" text,
	"statut_envoi" varchar(20),
	"date_envoi" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plannings_collecte" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"campagne_id" integer,
	"zone_collecte_id" integer,
	"agent_id" integer,
	"date_collecte" date NOT NULL,
	"heure_debut" time DEFAULT '07:00',
	"heure_fin" time DEFAULT '17:00',
	"villages_prevus" text[] DEFAULT '{}',
	"objectif_kg" numeric(10, 2) DEFAULT '0',
	"statut" varchar(20) DEFAULT 'planifie' NOT NULL,
	"tonnage_realise_kg" numeric(10, 2) DEFAULT '0',
	"nb_producteurs_prevus" integer DEFAULT 0,
	"nb_producteurs_venus" integer DEFAULT 0,
	"observations" text,
	"sms_envoye" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zones_collecte" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"section" varchar(100),
	"villages" text[] DEFAULT '{}',
	"agent_responsable_id" integer,
	"objectif_tonnage_kg" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestations_formation" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"numero_attestation" varchar(100),
	"date_emission" date DEFAULT CURRENT_DATE NOT NULL,
	"pdf_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestations_formation_numero_attestation_unique" UNIQUE("numero_attestation")
);
--> statement-breakpoint
CREATE TABLE "evaluations_formation" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"note_sur_10" integer,
	"commentaire" text,
	"points_forts" text,
	"points_ameliorer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inscriptions_formation" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"membre_id" integer NOT NULL,
	"statut" varchar(20) DEFAULT 'inscrit' NOT NULL,
	"date_inscription" timestamp with time zone DEFAULT now(),
	"sms_convocation_envoye" boolean DEFAULT false NOT NULL,
	"sms_rappel_envoye" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inscriptions_formation_session_id_membre_id_unique" UNIQUE("session_id","membre_id")
);
--> statement-breakpoint
CREATE TABLE "programmes_formation" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"titre" varchar(300) NOT NULL,
	"description" text,
	"thematiques" text[] DEFAULT '{}',
	"financeur" varchar(100),
	"budget_fcfa" numeric DEFAULT '0',
	"date_debut" date,
	"date_fin" date,
	"statut" varchar(20) DEFAULT 'planifie' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_formation" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"programme_id" integer,
	"campagne_id" integer,
	"titre" varchar(300) NOT NULL,
	"thematique" varchar(100),
	"formateur" varchar(200),
	"organisme_formateur" varchar(200),
	"lieu" varchar(200),
	"date_session" date NOT NULL,
	"heure_debut" time,
	"heure_fin" time,
	"duree_heures" numeric,
	"nb_places" integer,
	"cout_fcfa" numeric DEFAULT '0',
	"statut" varchar(20) DEFAULT 'planifie' NOT NULL,
	"support_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "caisses" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"responsable_id" integer,
	"solde_actuel_fcfa" numeric DEFAULT '0' NOT NULL,
	"fond_caisse_minimum_fcfa" numeric DEFAULT '0' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_caisse" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type" varchar(10) NOT NULL,
	"motif" varchar(50) NOT NULL,
	"montant_fcfa" numeric NOT NULL,
	"libelle" varchar(300),
	"reference_operation" varchar(100),
	"solde_apres_fcfa" numeric,
	"enregistre_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_caisse" (
	"id" serial PRIMARY KEY NOT NULL,
	"caisse_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"date_session" date NOT NULL,
	"ouvert_par" integer,
	"solde_ouverture_fcfa" numeric DEFAULT '0' NOT NULL,
	"solde_fermeture_theorique_fcfa" numeric,
	"solde_fermeture_reel_fcfa" numeric,
	"ecart_fcfa" numeric GENERATED ALWAYS AS (solde_fermeture_reel_fcfa - solde_fermeture_theorique_fcfa) STORED,
	"statut" varchar(20) DEFAULT 'ouverte' NOT NULL,
	"ferme_par" integer,
	"heure_ouverture" timestamp with time zone DEFAULT now(),
	"heure_fermeture" timestamp with time zone,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declarations_fiscales" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"obligation_id" integer NOT NULL,
	"periode" varchar(50) NOT NULL,
	"base_imposable_fcfa" numeric,
	"montant_calcule_fcfa" numeric DEFAULT '0' NOT NULL,
	"montant_paye_fcfa" numeric DEFAULT '0' NOT NULL,
	"date_echeance" date,
	"date_paiement" date,
	"reference_paiement" varchar(100),
	"statut" varchar(20) DEFAULT 'a_payer' NOT NULL,
	"penalite_retard_fcfa" numeric DEFAULT '0' NOT NULL,
	"document_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations_fiscales" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"type_taxe" varchar(30) NOT NULL,
	"libelle" varchar(200) NOT NULL,
	"base_calcul" text,
	"taux_pct" numeric,
	"periodicite" varchar(20) DEFAULT 'mensuel' NOT NULL,
	"jour_echeance" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lignes_releve" (
	"id" serial PRIMARY KEY NOT NULL,
	"releve_id" integer NOT NULL,
	"date_operation" date NOT NULL,
	"libelle_banque" varchar(500) NOT NULL,
	"montant_fcfa" numeric NOT NULL,
	"type" varchar(10) NOT NULL,
	"reference_banque" varchar(200),
	"statut_reconciliation" varchar(20) DEFAULT 'non_reconciliee' NOT NULL,
	"ecriture_id" integer,
	"ecart_fcfa" numeric DEFAULT '0' NOT NULL,
	"motif_ignore" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releves_bancaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"banque" varchar(100),
	"numero_compte" varchar(50),
	"periode_debut" date,
	"periode_fin" date,
	"solde_debut_fcfa" numeric DEFAULT '0',
	"solde_fin_fcfa" numeric DEFAULT '0',
	"statut" varchar(20) DEFAULT 'importe' NOT NULL,
	"importe_par" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depenses_investissement" (
	"id" serial PRIMARY KEY NOT NULL,
	"projet_id" integer NOT NULL,
	"cooperative_id" integer NOT NULL,
	"date_depense" date NOT NULL,
	"libelle" varchar(300) NOT NULL,
	"montant_fcfa" numeric(18, 0) NOT NULL,
	"fournisseur" varchar(200),
	"reference_facture" varchar(100),
	"facture_url" varchar(500),
	"equipement_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projets_investissement" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"titre" varchar(300) NOT NULL,
	"description" text,
	"categorie" varchar(50) DEFAULT 'autre' NOT NULL,
	"montant_estime_fcfa" numeric(18, 0) NOT NULL,
	"montant_engage_fcfa" numeric(18, 0) DEFAULT '0' NOT NULL,
	"montant_realise_fcfa" numeric(18, 0) DEFAULT '0' NOT NULL,
	"source_financement" varchar(30) DEFAULT 'fonds_propres' NOT NULL,
	"emprunt_id" integer,
	"subvention_id" integer,
	"date_debut_prevue" date,
	"date_fin_prevue" date,
	"date_fin_reelle" date,
	"statut" varchar(20) DEFAULT 'planifie' NOT NULL,
	"priorite" varchar(20) DEFAULT 'normale' NOT NULL,
	"responsable_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages_ticket" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"auteur_type" varchar(10) NOT NULL,
	"auteur_id" integer,
	"auteur_nom" varchar(200) NOT NULL,
	"contenu" text NOT NULL,
	"piece_jointe_url" varchar(500),
	"lu" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets_support" (
	"id" serial PRIMARY KEY NOT NULL,
	"cooperative_id" integer NOT NULL,
	"reference" varchar(20) NOT NULL,
	"titre" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"categorie" varchar(30) DEFAULT 'question',
	"priorite" varchar(20) DEFAULT 'normale' NOT NULL,
	"module_concerne" varchar(50),
	"capture_ecran_url" varchar(500),
	"ouvert_par" integer,
	"statut" varchar(20) DEFAULT 'ouvert' NOT NULL,
	"assigne_m15" varchar(200),
	"date_resolution" timestamp with time zone,
	"satisfaction" integer,
	"sms_haute_envoye" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_support_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres" ADD CONSTRAINT "membres_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotisations" ADD CONSTRAINT "cotisations_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances" ADD CONSTRAINT "avances_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances" ADD CONSTRAINT "avances_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bilans_campagne" ADD CONSTRAINT "bilans_campagne_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bilans_campagne" ADD CONSTRAINT "bilans_campagne_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bilans_campagne" ADD CONSTRAINT "bilans_campagne_genere_par_users_id_fk" FOREIGN KEY ("genere_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes" ADD CONSTRAINT "campagnes_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications_cloture" ADD CONSTRAINT "verifications_cloture_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_balance_id_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_peseur_id_users_id_fk" FOREIGN KEY ("peseur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_livraison_id_livraisons_id_fk" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_livraisons" ADD CONSTRAINT "lot_livraisons_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_livraisons" ADD CONSTRAINT "lot_livraisons_livraison_id_livraisons_id_fk" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrepots" ADD CONSTRAINT "entrepots_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_entrepot_id_entrepots_id_fk" FOREIGN KEY ("entrepot_id") REFERENCES "public"."entrepots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportateurs" ADD CONSTRAINT "exportateurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_exportateurs" ADD CONSTRAINT "ventes_exportateurs_exportateur_id_exportateurs_id_fk" FOREIGN KEY ("exportateur_id") REFERENCES "public"."exportateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_exportateurs" ADD CONSTRAINT "ventes_exportateurs_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_exportateurs" ADD CONSTRAINT "ventes_exportateurs_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_sms" ADD CONSTRAINT "historique_sms_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_sms" ADD CONSTRAINT "historique_sms_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances_personnel" ADD CONSTRAINT "avances_personnel_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avances_personnel" ADD CONSTRAINT "avances_personnel_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_paye_par_users_id_fk" FOREIGN KEY ("paye_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composantes_salaire" ADD CONSTRAINT "composantes_salaire_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_bulletin" ADD CONSTRAINT "lignes_bulletin_bulletin_id_bulletins_paie_id_fk" FOREIGN KEY ("bulletin_id") REFERENCES "public"."bulletins_paie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_parts_sociales" ADD CONSTRAINT "config_parts_sociales_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liberations_parts" ADD CONSTRAINT "liberations_parts_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liberations_parts" ADD CONSTRAINT "liberations_parts_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liberations_parts" ADD CONSTRAINT "liberations_parts_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traitements_refus" ADD CONSTRAINT "traitements_refus_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traitements_refus" ADD CONSTRAINT "traitements_refus_vente_exportateur_id_ventes_exportateurs_id_fk" FOREIGN KEY ("vente_exportateur_id") REFERENCES "public"."ventes_exportateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traitements_refus" ADD CONSTRAINT "traitements_refus_entrepot_retour_id_entrepots_id_fk" FOREIGN KEY ("entrepot_retour_id") REFERENCES "public"."entrepots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traitements_refus" ADD CONSTRAINT "traitements_refus_traite_par_users_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvisionnements_intrants" ADD CONSTRAINT "approvisionnements_intrants_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvisionnements_intrants" ADD CONSTRAINT "approvisionnements_intrants_intrant_id_intrants_id_fk" FOREIGN KEY ("intrant_id") REFERENCES "public"."intrants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvisionnements_intrants" ADD CONSTRAINT "approvisionnements_intrants_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories_intrants" ADD CONSTRAINT "categories_intrants_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions_intrants" ADD CONSTRAINT "distributions_intrants_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions_intrants" ADD CONSTRAINT "distributions_intrants_intrant_id_intrants_id_fk" FOREIGN KEY ("intrant_id") REFERENCES "public"."intrants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions_intrants" ADD CONSTRAINT "distributions_intrants_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions_intrants" ADD CONSTRAINT "distributions_intrants_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions_intrants" ADD CONSTRAINT "distributions_intrants_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intrants" ADD CONSTRAINT "intrants_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intrants" ADD CONSTRAINT "intrants_categorie_id_categories_intrants_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories_intrants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_intrants" ADD CONSTRAINT "remboursements_intrants_distribution_id_distributions_intrants_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "public"."distributions_intrants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_intrants" ADD CONSTRAINT "remboursements_intrants_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeancier_emprunts" ADD CONSTRAINT "echeancier_emprunts_emprunt_id_emprunts_id_fk" FOREIGN KEY ("emprunt_id") REFERENCES "public"."emprunts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_preteur_id_preteurs_id_fk" FOREIGN KEY ("preteur_id") REFERENCES "public"."preteurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preteurs" ADD CONSTRAINT "preteurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_emprunts" ADD CONSTRAINT "remboursements_emprunts_emprunt_id_emprunts_id_fk" FOREIGN KEY ("emprunt_id") REFERENCES "public"."emprunts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements_emprunts" ADD CONSTRAINT "remboursements_emprunts_echeance_id_echeancier_emprunts_id_fk" FOREIGN KEY ("echeance_id") REFERENCES "public"."echeancier_emprunts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taux_change" ADD CONSTRAINT "taux_change_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taux_change" ADD CONSTRAINT "taux_change_saisi_par_users_id_fk" FOREIGN KEY ("saisi_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets_campagne" ADD CONSTRAINT "budgets_campagne_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets_campagne" ADD CONSTRAINT "budgets_campagne_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets_campagne" ADD CONSTRAINT "budgets_campagne_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses_budget" ADD CONSTRAINT "hypotheses_budget_budget_id_budgets_campagne_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets_campagne"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_budget" ADD CONSTRAINT "lignes_budget_budget_id_budgets_campagne_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets_campagne"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bailleurs" ADD CONSTRAINT "bailleurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapports_bailleurs" ADD CONSTRAINT "rapports_bailleurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subventions" ADD CONSTRAINT "subventions_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblees_generales" ADD CONSTRAINT "assemblees_generales_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocations_ag" ADD CONSTRAINT "convocations_ag_ag_id_assemblees_generales_id_fk" FOREIGN KEY ("ag_id") REFERENCES "public"."assemblees_generales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ordre_du_jour" ADD CONSTRAINT "points_ordre_du_jour_ag_id_assemblees_generales_id_fk" FOREIGN KEY ("ag_id") REFERENCES "public"."assemblees_generales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presences_ag" ADD CONSTRAINT "presences_ag_ag_id_assemblees_generales_id_fk" FOREIGN KEY ("ag_id") REFERENCES "public"."assemblees_generales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presences_ag" ADD CONSTRAINT "presences_ag_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presences_ag" ADD CONSTRAINT "presences_ag_mandataire_id_membres_id_fk" FOREIGN KEY ("mandataire_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes_ag" ADD CONSTRAINT "votes_ag_ag_id_assemblees_generales_id_fk" FOREIGN KEY ("ag_id") REFERENCES "public"."assemblees_generales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes_ag" ADD CONSTRAINT "votes_ag_point_id_points_ordre_du_jour_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."points_ordre_du_jour"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertes_prix" ADD CONSTRAINT "alertes_prix_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_prix" ADD CONSTRAINT "config_prix_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_prix" ADD CONSTRAINT "historique_prix_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_prix" ADD CONSTRAINT "historique_prix_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_prix" ADD CONSTRAINT "historique_prix_saisi_par_users_id_fk" FOREIGN KEY ("saisi_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_scoring" ADD CONSTRAINT "config_scoring_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores_membres" ADD CONSTRAINT "scores_membres_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores_membres" ADD CONSTRAINT "scores_membres_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores_membres" ADD CONSTRAINT "scores_membres_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_anomalies" ADD CONSTRAINT "config_anomalies_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences_notifications" ADD CONSTRAINT "preferences_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences_notifications" ADD CONSTRAINT "preferences_notifications_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_cooperative" ADD CONSTRAINT "config_cooperative_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_cooperative" ADD CONSTRAINT "config_cooperative_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_officiels" ADD CONSTRAINT "documents_officiels_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chauffeurs" ADD CONSTRAINT "chauffeurs_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entretiens_vehicule" ADD CONSTRAINT "entretiens_vehicule_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions_transport" ADD CONSTRAINT "missions_transport_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions_transport" ADD CONSTRAINT "missions_transport_vehicule_id_vehicules_id_fk" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions_transport" ADD CONSTRAINT "missions_transport_chauffeur_id_chauffeurs_id_fk" FOREIGN KEY ("chauffeur_id") REFERENCES "public"."chauffeurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicules" ADD CONSTRAINT "vehicules_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_pesee" ADD CONSTRAINT "config_pesee_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litiges_pesee" ADD CONSTRAINT "litiges_pesee_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litiges_pesee" ADD CONSTRAINT "litiges_pesee_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litiges_pesee" ADD CONSTRAINT "litiges_pesee_resolu_par_users_id_fk" FOREIGN KEY ("resolu_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications_balance" ADD CONSTRAINT "verifications_balance_balance_id_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories_equipements" ADD CONSTRAINT "categories_equipements_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotations_amortissement" ADD CONSTRAINT "dotations_amortissement_equipement_id_equipements_id_fk" FOREIGN KEY ("equipement_id") REFERENCES "public"."equipements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotations_amortissement" ADD CONSTRAINT "dotations_amortissement_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipements" ADD CONSTRAINT "equipements_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipements" ADD CONSTRAINT "equipements_categorie_id_categories_equipements_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories_equipements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipements" ADD CONSTRAINT "equipements_affecte_user_id_users_id_fk" FOREIGN KEY ("affecte_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenances_equipement" ADD CONSTRAINT "maintenances_equipement_equipement_id_equipements_id_fk" FOREIGN KEY ("equipement_id") REFERENCES "public"."equipements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previsions_campagne" ADD CONSTRAINT "previsions_campagne_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previsions_campagne" ADD CONSTRAINT "previsions_campagne_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_licences" ADD CONSTRAINT "historique_licences_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_licences" ADD CONSTRAINT "historique_licences_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_licences" ADD CONSTRAINT "historique_licences_effectue_par_m15_users_id_fk" FOREIGN KEY ("effectue_par") REFERENCES "public"."m15_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_plan_id_plans_abonnement_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans_abonnement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_suspendu_par_m15_users_id_fk" FOREIGN KEY ("suspendu_par") REFERENCES "public"."m15_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_supprime_par_m15_users_id_fk" FOREIGN KEY ("supprime_par") REFERENCES "public"."m15_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_cree_par_m15_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."m15_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_rendements" ADD CONSTRAINT "historique_rendements_parcelle_id_parcelles_id_fk" FOREIGN KEY ("parcelle_id") REFERENCES "public"."parcelles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_rendements" ADD CONSTRAINT "historique_rendements_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelles" ADD CONSTRAINT "parcelles_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelles" ADD CONSTRAINT "parcelles_membre_id_membres_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelles" ADD CONSTRAINT "parcelles_enregistre_par_users_id_fk" FOREIGN KEY ("enregistre_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones_risque_eudr" ADD CONSTRAINT "zones_risque_eudr_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_rse" ADD CONSTRAINT "formations_rse_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_rse" ADD CONSTRAINT "formations_rse_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicateurs_rse" ADD CONSTRAINT "indicateurs_rse_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicateurs_rse" ADD CONSTRAINT "indicateurs_rse_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicateurs_rse" ADD CONSTRAINT "indicateurs_rse_calcule_par_users_id_fk" FOREIGN KEY ("calcule_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses_investissement" ADD CONSTRAINT "depenses_investissement_projet_id_projets_investissement_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets_investissement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses_investissement" ADD CONSTRAINT "depenses_investissement_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depenses_investissement" ADD CONSTRAINT "depenses_investissement_equipement_id_equipements_id_fk" FOREIGN KEY ("equipement_id") REFERENCES "public"."equipements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_investissement" ADD CONSTRAINT "projets_investissement_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_investissement" ADD CONSTRAINT "projets_investissement_emprunt_id_emprunts_id_fk" FOREIGN KEY ("emprunt_id") REFERENCES "public"."emprunts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_investissement" ADD CONSTRAINT "projets_investissement_subvention_id_subventions_id_fk" FOREIGN KEY ("subvention_id") REFERENCES "public"."subventions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets_investissement" ADD CONSTRAINT "projets_investissement_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_ticket" ADD CONSTRAINT "messages_ticket_ticket_id_tickets_support_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets_support"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets_support" ADD CONSTRAINT "tickets_support_cooperative_id_cooperatives_id_fk" FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets_support" ADD CONSTRAINT "tickets_support_ouvert_par_users_id_fk" FOREIGN KEY ("ouvert_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_cooperative" ON "audit_trail" USING btree ("cooperative_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_module" ON "audit_trail" USING btree ("module");--> statement-breakpoint
CREATE INDEX "idx_audit_entite" ON "audit_trail" USING btree ("entite_type","entite_id");--> statement-breakpoint
CREATE INDEX "idx_audit_date" ON "audit_trail" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_trail" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions_utilisateurs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_coop" ON "sessions_utilisateurs" USING btree ("cooperative_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_token" ON "sessions_utilisateurs" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "idx_sessions_date" ON "sessions_utilisateurs" USING btree ("date_connexion");