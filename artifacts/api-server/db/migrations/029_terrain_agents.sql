-- Migration 029 : section agents terrain + seed agents

ALTER TABLE users ADD COLUMN IF NOT EXISTS section TEXT;

INSERT INTO users (cooperative_id, nom, prenoms, email, telephone, password_hash, role, section, actif)
VALUES
  (1, 'Koné', 'Mamadou', 'kone.mamadou@coopdigital.ci', '0701020304',
   '$2b$10$99hiapMU/4VMqbx35kenDOGsrWXa1dtmnjT4pDP/OxPDUrc2/5XsO',
   'agent_terrain', 'Tiébissou', true),
  (1, 'Ouattara', 'Fatou', 'ouattara.fatou@coopdigital.ci', '0705060708',
   '$2b$10$IUIfNKSzk3sMDp6PBIDiOOjjZbcDKZUMbkp90VHvCxJy82xlbUGhO',
   'agent_terrain', 'Yamoussoukro', true)
ON CONFLICT (email) DO NOTHING;
