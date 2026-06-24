-- Make vente_exportateur_id nullable (refus can come from port reception, not just vente)
ALTER TABLE traitements_refus ALTER COLUMN vente_exportateur_id DROP NOT NULL;

-- Add expedition_id FK for port-reception-sourced refus
ALTER TABLE traitements_refus ADD COLUMN IF NOT EXISTS expedition_id integer REFERENCES expeditions(id);

-- Add source_type to distinguish origin
ALTER TABLE traitements_refus ADD COLUMN IF NOT EXISTS source_type varchar(30) NOT NULL DEFAULT 'vente_exportateur';

-- Backfill existing rows
UPDATE traitements_refus SET source_type = 'vente_exportateur' WHERE source_type = 'vente_exportateur';
