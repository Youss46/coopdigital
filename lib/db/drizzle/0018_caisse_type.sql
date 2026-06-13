ALTER TABLE "caisses" ADD COLUMN IF NOT EXISTS "type_caisse" varchar(10) NOT NULL DEFAULT 'centrale';

UPDATE "caisses" SET "type_caisse" = 'deleguee' WHERE "responsable_id" IS NOT NULL;
UPDATE "caisses" SET "type_caisse" = 'centrale'  WHERE "responsable_id" IS NULL;
