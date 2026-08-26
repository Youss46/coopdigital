ALTER TABLE "missions_membres"
  ADD COLUMN IF NOT EXISTS "gps_crs" varchar(20);

ALTER TABLE "membres"
  ADD COLUMN IF NOT EXISTS "gps_crs" varchar(20);