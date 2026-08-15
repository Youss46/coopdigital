-- Migration 0087 : rendre livraison_id nullable dans paiements + ajouter bon_carburant_id
ALTER TABLE "paiements" ALTER COLUMN "livraison_id" DROP NOT NULL;
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "bon_carburant_id" integer REFERENCES "bons_carburant"("id") ON DELETE SET NULL;
