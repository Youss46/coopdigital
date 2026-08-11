ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delegue_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
