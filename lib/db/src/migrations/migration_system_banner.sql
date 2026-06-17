CREATE TABLE IF NOT EXISTS system_banner (
  id         SERIAL PRIMARY KEY,
  actif      BOOLEAN NOT NULL DEFAULT false,
  message    TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_banner (actif, message)
SELECT false, null
WHERE NOT EXISTS (SELECT 1 FROM system_banner);
