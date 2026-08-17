ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "agent_saisiseur_id" integer REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "avances" ADD COLUMN IF NOT EXISTS "agent_saisiseur_id" integer REFERENCES "users"("id");
