ALTER TABLE "config_comptable" ADD COLUMN IF NOT EXISTS "auto_caisse" boolean NOT NULL DEFAULT false;
ALTER TABLE "config_comptable" ADD COLUMN IF NOT EXISTS "auto_banque" boolean NOT NULL DEFAULT false;
ALTER TABLE "config_comptable" ADD COLUMN IF NOT EXISTS "auto_subventions" boolean NOT NULL DEFAULT false;
ALTER TABLE "config_comptable" ADD COLUMN IF NOT EXISTS "auto_mobile_marchand" boolean NOT NULL DEFAULT false;
