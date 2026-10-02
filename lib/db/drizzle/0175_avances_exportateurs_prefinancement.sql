ALTER TYPE "public"."source_ecriture" ADD VALUE IF NOT EXISTS 'avance_exportateur';
--> statement-breakpoint
ALTER TYPE "public"."source_ecriture_attente" ADD VALUE IF NOT EXISTS 'avance_exportateur';
--> statement-breakpoint
ALTER TABLE "public"."ventes_exportateurs"
  ADD COLUMN IF NOT EXISTS "montant_avance_imputee_fcfa" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."ventes_exportateurs"
  ADD CONSTRAINT "ventes_exportateurs_avance_imputee_nonnegatif_check"
  CHECK ("montant_avance_imputee_fcfa" >= 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."avances_exportateurs" (
  "id" serial PRIMARY KEY NOT NULL,
  "cooperative_id" integer NOT NULL,
  "exportateur_id" integer NOT NULL,
  "numero_cheque" varchar(80) NOT NULL,
  "banque" varchar(200) NOT NULL,
  "montant_fcfa" integer NOT NULL,
  "date_reception" date NOT NULL,
  "date_echeance" date,
  "statut" "public"."statut_cheque_recu" DEFAULT 'a_deposer' NOT NULL,
  "date_depot" date,
  "date_encaissement" date,
  "date_rejet" date,
  "motif_rejet" text,
  "date_annulation" date,
  "motif_annulation" text,
  "compte_bancaire_id" integer,
  "mouvement_banque_id" integer,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "avances_exportateurs_cooperative_id_cooperatives_id_fk"
    FOREIGN KEY ("cooperative_id") REFERENCES "public"."cooperatives"("id"),
  CONSTRAINT "avances_exportateurs_exportateur_id_exportateurs_id_fk"
    FOREIGN KEY ("exportateur_id") REFERENCES "public"."exportateurs"("id"),
  CONSTRAINT "avances_exportateurs_montant_positive_check"
    CHECK ("montant_fcfa" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "avances_exportateurs_coop_numero_unique"
  ON "public"."avances_exportateurs" USING btree ("cooperative_id", "numero_cheque");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."imputations_avances_exportateurs" (
  "id" serial PRIMARY KEY NOT NULL,
  "avance_exportateur_id" integer NOT NULL,
  "vente_exportateur_id" integer NOT NULL,
  "montant_fcfa" integer NOT NULL,
  "date_imputation" date DEFAULT CURRENT_DATE NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "imputations_avances_exportateurs_avance_exportateur_id_avances_exportateurs_id_fk"
    FOREIGN KEY ("avance_exportateur_id") REFERENCES "public"."avances_exportateurs"("id"),
  CONSTRAINT "imputations_avances_exportateurs_vente_exportateur_id_ventes_exportateurs_id_fk"
    FOREIGN KEY ("vente_exportateur_id") REFERENCES "public"."ventes_exportateurs"("id"),
  CONSTRAINT "imputations_avances_exportateurs_montant_positive"
    CHECK ("montant_fcfa" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imputations_avances_exportateurs_avance_idx"
  ON "public"."imputations_avances_exportateurs" USING btree ("avance_exportateur_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imputations_avances_exportateurs_vente_idx"
  ON "public"."imputations_avances_exportateurs" USING btree ("vente_exportateur_id");