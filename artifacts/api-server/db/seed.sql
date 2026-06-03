-- ============================================================
-- Seed CoopDigital — données de test
-- ============================================================

-- Coopérative
INSERT INTO cooperatives (nom, ville, region) VALUES
  ('COOP-CA Soubré', 'Soubré', 'Sud-Ouest')
ON CONFLICT DO NOTHING;

-- Utilisateur admin (mot de passe : Admin1234!)
-- hash bcrypt de "Admin1234!" avec saltRounds=10
INSERT INTO users (cooperative_id, nom, prenoms, email, password_hash, role) VALUES
  (1, 'Koné', 'Amadou', 'admin@coopdigital.ci',
   '$2b$10$xgIqFaFwVYE.ioJ4FSxnRurxtJY.7Lwp0CNC7e/spyLQ/MXBJpWOW',
   'admin')
ON CONFLICT DO NOTHING;

-- 5 membres
INSERT INTO membres (cooperative_id, nom, prenoms, telephone, village, groupement, superficie_ha, statut, date_adhesion) VALUES
  (1, 'Kouassi', 'Koffi Jean', '0701020304', 'Méagui', 'Groupement Unité', 3.50, 'actif', '2022-03-15'),
  (1, 'Bamba', 'Aminata', '0705060708', 'Gueyo', 'Femmes Actives', 2.00, 'actif', '2022-06-01'),
  (1, 'Traoré', 'Ibrahim', '0709101112', 'Soubré', 'Les Bâtisseurs', 5.25, 'actif', '2021-11-20'),
  (1, 'Gnagne', 'Rosalie', '0713141516', 'Buyo', 'Groupement Unité', 1.75, 'actif', '2023-01-10'),
  (1, 'Aka', 'Emmanuel', '0717181920', 'Okrouyo', 'Les Bâtisseurs', 4.00, 'inactif', '2021-08-05')
ON CONFLICT DO NOTHING;

-- 3 avances
INSERT INTO avances (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa, solde_restant_fcfa, date_octroi, date_echeance, motif, statut, agent_id) VALUES
  (1, 150000, 50000, 100000, '2024-10-01', '2025-03-01', 'Achat engrais', 'en_cours', 1),
  (2, 75000, 75000, 0, '2024-09-15', '2025-01-15', 'Frais scolaires', 'rembourse', 1),
  (3, 200000, 0, 200000, '2024-11-01', '2025-04-01', 'Réparation matériel', 'en_retard', 1)
ON CONFLICT DO NOTHING;

-- 4 livraisons
INSERT INTO livraisons (membre_id, poids_kg, prix_unitaire_fcfa, montant_brut_fcfa, avance_deduite_fcfa, montant_net_fcfa, date_livraison, agent_id) VALUES
  (1, 120.50, 900, 108450, 50000, 58450, '2024-11-05', 1),
  (2, 85.00, 900, 76500, 75000, 1500, '2024-11-06', 1),
  (3, 200.00, 950, 190000, 0, 190000, '2024-11-07', 1),
  (4, 60.00, 900, 54000, 0, 54000, '2024-11-08', 1)
ON CONFLICT DO NOTHING;

-- Paiements liés aux livraisons
INSERT INTO paiements (livraison_id, membre_id, montant_fcfa, mode_paiement, statut) VALUES
  (1, 1, 58450, 'orange_money', 'confirme'),
  (2, 2, 1500, 'especes', 'confirme'),
  (3, 3, 190000, 'mtn_momo', 'en_attente'),
  (4, 4, 54000, 'especes', 'confirme')
ON CONFLICT DO NOTHING;
