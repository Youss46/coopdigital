-- ============================================================
-- SEED PRODUCTION — CoopDigital
-- À exécuter UNE SEULE FOIS dans Railway → PostgreSQL → Query
-- ============================================================

-- 1. Coopérative de démonstration
INSERT INTO cooperatives (nom, ville, region) VALUES
  ('COOP-CA Soubré', 'Soubré', 'Sud-Ouest')
ON CONFLICT DO NOTHING;

-- 2. Admin CoopDigital (mot de passe : Admin1234!)
INSERT INTO users (cooperative_id, nom, prenoms, email, password_hash, role) VALUES
  (1, 'Koné', 'Amadou', 'admin@coopdigital.ci',
   '$2b$10$2bxtFUupvhLf9ZcAbFpapu0CFSv4B9J611tkk.R3Yr4Vitf7QDpra',
   'admin')
ON CONFLICT (email) DO NOTHING;

-- 3. Superadmin M15 Tech (mot de passe : @Youss054626)
INSERT INTO m15_users (nom, email, password_hash, role, actif) VALUES
  ('Youss', 'contacteyouss@gmail.com',
   '$2b$10$PMEzxeEVMl9hcBsb/GrVPe0JcuLWFUXB5ZqTUUopt9tonMPEdPJSq',
   'superadmin', true)
ON CONFLICT (email) DO NOTHING;
