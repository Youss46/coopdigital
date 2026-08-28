CREATE TABLE IF NOT EXISTS "comptes_tiers" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL REFERENCES "cooperatives"("id") ON DELETE CASCADE,
  "tiers_type" varchar(30) NOT NULL,
  "tiers_id" integer NOT NULL,
  "compte_collectif" varchar(20) NOT NULL,
  "numero_compte" varchar(20) NOT NULL,
  "actif" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "comptes_tiers_coop_tiers_collectif_unique"
    UNIQUE ("cooperative_id", "tiers_type", "tiers_id", "compte_collectif"),
  CONSTRAINT "comptes_tiers_coop_numero_unique"
    UNIQUE ("cooperative_id", "numero_compte")
);

CREATE INDEX IF NOT EXISTS "comptes_tiers_coop_tiers_idx"
  ON "comptes_tiers" ("cooperative_id", "tiers_type", "tiers_id");