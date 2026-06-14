-- Migration 0029 : Restaurer agent_terrain dans la contrainte CHECK du rôle
-- La migration ad-hoc migration_delegue_role.sql avait retiré agent_terrain.
-- Ce correctif rétablit tous les rôles valides.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS users_role_check;--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "section" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mot_de_passe_temporaire" boolean DEFAULT false;--> statement-breakpoint
