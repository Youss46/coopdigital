-- Add tiers tracking (individual member/supplier) to accounting entries
ALTER TABLE ecritures_comptables
  ADD COLUMN IF NOT EXISTS tiers_id   integer,
  ADD COLUMN IF NOT EXISTS tiers_type varchar(20);

CREATE INDEX IF NOT EXISTS idx_ecritures_tiers ON ecritures_comptables (cooperative_id, tiers_type, tiers_id);
