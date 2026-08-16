-- Migration 0092 : traçabilité délégué pour fournisseurs externes
ALTER TABLE "fournisseurs" ADD COLUMN IF NOT EXISTS "cree_par_delegue_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
