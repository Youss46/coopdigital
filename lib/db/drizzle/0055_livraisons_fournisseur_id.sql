-- Migration 0055 : support pisteurs/fournisseurs externes dans les livraisons
-- membre_id devient nullable (livraisons de pisteurs/externes n'ont pas de membre)
-- fournisseur_id pointe vers la table fournisseurs
ALTER TABLE "livraisons" ALTER COLUMN "membre_id" DROP NOT NULL;
ALTER TABLE "livraisons" ADD COLUMN IF NOT EXISTS "fournisseur_id" integer REFERENCES "fournisseurs"("id");
