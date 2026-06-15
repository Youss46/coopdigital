-- ── Migration 0032 : Entrepôts délégués & transferts stock ─────────────────

-- ENUMS
DO $$ BEGIN
  CREATE TYPE "public"."transfert_statut" AS ENUM (
    'planifie', 'en_cours', 'arrive', 'confirme', 'litige'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."transfert_motif_ecart" AS ENUM (
    'evaporation', 'perte', 'erreur_pesee', 'autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."entrepot_mouvement_type" AS ENUM (
    'entree', 'sortie'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."entrepot_mouvement_motif" AS ENUM (
    'livraison_membre', 'transfert_central', 'ajustement', 'perte'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrepots_delegues" (
  "id"                  SERIAL PRIMARY KEY,
  "delegue_id"          INTEGER NOT NULL REFERENCES "users"("id"),
  "cooperative_id"      INTEGER NOT NULL REFERENCES "cooperatives"("id"),
  "nom"                 VARCHAR(255) NOT NULL,
  "zone_nom"            VARCHAR(255),
  "zone_type"           VARCHAR(50),
  "capacite_max_kg"     DECIMAL(12,2),
  "seuil_alerte_kg"     DECIMAL(12,2),
  "stock_actuel_kg"     DECIMAL(12,2) DEFAULT 0,
  "stock_mis_a_jour_le" TIMESTAMP WITH TIME ZONE,
  "adresse"             VARCHAR(500),
  "gps_lat"             DECIMAL(10,7),
  "gps_lng"             DECIMAL(10,7),
  "actif"               BOOLEAN DEFAULT true,
  "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transferts_stock" (
  "id"                  SERIAL PRIMARY KEY,
  "numero_transfert"    VARCHAR(30) NOT NULL UNIQUE,
  "campagne_id"         INTEGER REFERENCES "campagnes"("id"),
  "entrepot_source_id"  INTEGER NOT NULL REFERENCES "entrepots_delegues"("id"),
  "delegue_id"          INTEGER NOT NULL REFERENCES "users"("id"),
  "cooperative_id"      INTEGER NOT NULL REFERENCES "cooperatives"("id"),
  "destination"         VARCHAR(100) DEFAULT 'magasin_central',
  "type_vehicule"       VARCHAR(20),
  "immatriculation"     VARCHAR(50),
  "nom_chauffeur"       VARCHAR(200),
  "telephone_chauffeur" VARCHAR(30),
  "transporteur"        VARCHAR(200),
  "poids_depart_kg"     DECIMAL(12,2),
  "poids_arrivee_kg"    DECIMAL(12,2),
  "ecart_kg"            DECIMAL(12,2),
  "motif_ecart"         "transfert_motif_ecart",
  "date_depart"         TIMESTAMP WITH TIME ZONE,
  "date_arrivee"        TIMESTAMP WITH TIME ZONE,
  "date_prevue"         TIMESTAMP WITH TIME ZONE,
  "statut"              "transfert_statut" NOT NULL DEFAULT 'planifie',
  "confirme_par"        INTEGER REFERENCES "users"("id"),
  "confirme_le"         TIMESTAMP WITH TIME ZONE,
  "documents"           JSONB DEFAULT '[]',
  "notes"               TEXT,
  "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrepot_mouvements" (
  "id"                  SERIAL PRIMARY KEY,
  "entrepot_id"         INTEGER NOT NULL REFERENCES "entrepots_delegues"("id"),
  "type_mouvement"      "entrepot_mouvement_type" NOT NULL,
  "motif"               "entrepot_mouvement_motif" NOT NULL,
  "poids_kg"            DECIMAL(12,2) NOT NULL,
  "stock_avant_kg"      DECIMAL(12,2),
  "stock_apres_kg"      DECIMAL(12,2),
  "livraison_id"        INTEGER REFERENCES "livraisons"("id"),
  "transfert_id"        INTEGER REFERENCES "transferts_stock"("id"),
  "enregistre_par"      INTEGER REFERENCES "users"("id"),
  "date_mouvement"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "notes"               TEXT
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entrepots_delegues_cooperative"
  ON "entrepots_delegues"("cooperative_id");

CREATE INDEX IF NOT EXISTS "idx_entrepots_delegues_delegue"
  ON "entrepots_delegues"("delegue_id");

CREATE INDEX IF NOT EXISTS "idx_entrepot_mouvements_entrepot"
  ON "entrepot_mouvements"("entrepot_id");

CREATE INDEX IF NOT EXISTS "idx_transferts_stock_cooperative"
  ON "transferts_stock"("cooperative_id");

CREATE INDEX IF NOT EXISTS "idx_transferts_stock_statut"
  ON "transferts_stock"("statut");
