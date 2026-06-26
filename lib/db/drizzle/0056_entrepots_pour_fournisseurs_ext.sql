-- Migration 0056 : entrepôt dédié aux livraisons pisteurs/fournisseurs externes
ALTER TABLE "entrepots" ADD COLUMN IF NOT EXISTS "pour_fournisseurs_ext" boolean DEFAULT false NOT NULL;
