-- Migration 0054 : contrainte unique code fournisseur par coopérative (isolation multi-tenant)
-- L'ancienne contrainte UNIQUE(code) est globale → deux coopératives ne peuvent pas avoir
-- le même code (ex: PST-2026-0001). La nouvelle contrainte est UNIQUE(cooperative_id, code).
ALTER TABLE "fournisseurs" DROP CONSTRAINT IF EXISTS "fournisseurs_code_unique";
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_cooperative_id_code_unique" UNIQUE ("cooperative_id", "code");
