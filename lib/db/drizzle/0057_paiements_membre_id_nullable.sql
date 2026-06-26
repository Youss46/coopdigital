-- Migration 0057 : paiements.membre_id nullable pour les livraisons pisteurs/fournisseurs externes
ALTER TABLE "paiements" ALTER COLUMN "membre_id" DROP NOT NULL;
