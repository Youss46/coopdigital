-- Migration 0022 : rattachement lot → expedition_lots
ALTER TABLE expedition_lots
  ADD COLUMN IF NOT EXISTS lot_id INTEGER REFERENCES lots(id);
