ALTER TABLE "parcelles"
  ADD COLUMN IF NOT EXISTS "geometrie" jsonb,
  ADD COLUMN IF NOT EXISTS "surface_polygone_ha" numeric(10, 4),
  ADD COLUMN IF NOT EXISTS "distance_gps_m" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "statut_polygone" varchar(40);
