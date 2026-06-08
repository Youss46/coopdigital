-- Enum values (idempotent)
DO $$ BEGIN ALTER TYPE "public"."paiement_statut" ADD VALUE 'rejete'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."paiement_statut" ADD VALUE 'en_cours'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."paiement_statut" ADD VALUE 'effectue'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."lot_statut" ADD VALUE 'refoule'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."lot_statut" ADD VALUE 'fusionne'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."vente_statut" ADD VALUE 'refoule'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."vente_statut" ADD VALUE 'partiellement_refoule'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Colonnes livraisons (paiement différé)
ALTER TABLE "livraisons" ADD COLUMN IF NOT EXISTS "statut_paiement" text DEFAULT 'PAYÉ';--> statement-breakpoint
ALTER TABLE "livraisons" ADD COLUMN IF NOT EXISTS "montant_restant" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "livraisons" ADD COLUMN IF NOT EXISTS "date_paiement_prevue" date;--> statement-breakpoint

-- Colonnes paiements (validation / rejet)
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "valide_par" integer;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "date_validation" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "motif_rejet" text;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "initialise_par" integer;--> statement-breakpoint

-- Colonnes lots
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "parent_lot_ids" integer[];--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "vente_exportateur_id" integer;--> statement-breakpoint

-- Contraintes FK (idempotentes)
DO $$ BEGIN ALTER TABLE "paiements" ADD CONSTRAINT "paiements_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "paiements" ADD CONSTRAINT "paiements_initialise_par_users_id_fk" FOREIGN KEY ("initialise_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;