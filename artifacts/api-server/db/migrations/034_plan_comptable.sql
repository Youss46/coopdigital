-- 034_plan_comptable.sql
-- Plan comptable personnalisé + paramètres comptes modules + corrections écritures

-- ① Enrichir plan_comptable avec les colonnes manquantes
ALTER TABLE plan_comptable
  ADD COLUMN IF NOT EXISTS classe           INTEGER,
  ADD COLUMN IF NOT EXISTS compte_parent    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS solde_normal     VARCHAR(20) DEFAULT 'debiteur',
  ADD COLUMN IF NOT EXISTS actif            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordre_affichage  INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP WITH TIME ZONE;

-- ② Mettre à jour les comptes existants avec leur classe et solde_normal
UPDATE plan_comptable SET classe = 1, solde_normal = 'crediteur'                              WHERE cooperative_id = 1 AND numero_compte = '101';
UPDATE plan_comptable SET classe = 1, solde_normal = 'crediteur'                              WHERE cooperative_id = 1 AND numero_compte = '130';
UPDATE plan_comptable SET classe = 1, solde_normal = 'crediteur'                              WHERE cooperative_id = 1 AND numero_compte = '164';
UPDATE plan_comptable SET classe = 4, solde_normal = 'crediteur'                              WHERE cooperative_id = 1 AND numero_compte = '401';
UPDATE plan_comptable SET classe = 4, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '411';
UPDATE plan_comptable SET classe = 4, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '4111';
UPDATE plan_comptable SET classe = 4, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '416';
UPDATE plan_comptable SET classe = 5, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '521';
UPDATE plan_comptable SET classe = 5, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '571';
UPDATE plan_comptable SET classe = 6, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '601';
UPDATE plan_comptable SET classe = 6, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '621';
UPDATE plan_comptable SET classe = 6, solde_normal = 'debiteur'                               WHERE cooperative_id = 1 AND numero_compte = '641';
UPDATE plan_comptable SET libelle = 'Rémunérations (salaires bruts)', classe = 6, solde_normal = 'debiteur' WHERE cooperative_id = 1 AND numero_compte = '661';
UPDATE plan_comptable SET classe = 7, solde_normal = 'crediteur'                              WHERE cooperative_id = 1 AND numero_compte = '701';

-- ③ Insérer les comptes OHADA manquants (ON CONFLICT = skip si déjà existant)
INSERT INTO plan_comptable (cooperative_id, numero_compte, libelle, type, classe, solde_normal, actif) VALUES
  -- CLASSE 1 — Capitaux
  (1, '111', 'Réserves légales',               'passif',  1, 'crediteur', true),
  (1, '118', 'Autres réserves',                'passif',  1, 'crediteur', true),
  (1, '141', 'Subventions d''équipement',      'passif',  1, 'crediteur', true),
  -- CLASSE 2 — Immobilisations
  (1, '231', 'Bâtiments',                      'actif',   2, 'debiteur',  true),
  (1, '244', 'Matériel et outillage',           'actif',   2, 'debiteur',  true),
  (1, '281', 'Amortissement bâtiments',         'actif',   2, 'crediteur', true),
  (1, '284', 'Amortissement matériel',          'actif',   2, 'crediteur', true),
  -- CLASSE 3 — Stocks
  (1, '31',  'Stocks de marchandises',          'actif',   3, 'debiteur',  true),
  (1, '32',  'Stocks matières premières',       'actif',   3, 'debiteur',  true),
  -- CLASSE 4 — Tiers
  (1, '421', 'Personnel rémunérations dues',    'passif',  4, 'crediteur', true),
  (1, '422', 'Personnel à payer',               'passif',  4, 'crediteur', true),
  (1, '425', 'Avances au personnel',            'actif',   4, 'debiteur',  true),
  (1, '431', 'CNPS à payer',                    'passif',  4, 'crediteur', true),
  (1, '441', 'État impôts sur bénéfices',       'passif',  4, 'crediteur', true),
  (1, '444', 'État ITS à payer',                'passif',  4, 'crediteur', true),
  -- CLASSE 5 — Trésorerie
  (1, '522', 'Banque secondaire',               'actif',   5, 'debiteur',  true),
  (1, '572', 'Caisse terrain',                  'actif',   5, 'debiteur',  true),
  -- CLASSE 6 — Charges
  (1, '6011','Achats café',                     'charge',  6, 'debiteur',  true),
  (1, '6012','Achats hévéa',                    'charge',  6, 'debiteur',  true),
  (1, '603', 'Variation stocks',                'charge',  6, 'debiteur',  true),
  (1, '6031','Pertes sur stocks',               'charge',  6, 'debiteur',  true),
  (1, '615', 'Entretien et réparations',        'charge',  6, 'debiteur',  true),
  (1, '624', 'Transports sur achats',           'charge',  6, 'debiteur',  true),
  (1, '645', 'Charges sociales (CNPS patronal)','charge',  6, 'debiteur',  true),
  (1, '658', 'Dons et libéralités',             'charge',  6, 'debiteur',  true),
  (1, '664', 'Charges sociales',                'charge',  6, 'debiteur',  true),
  (1, '671', 'Intérêts et charges financières', 'charge',  6, 'debiteur',  true),
  (1, '676', 'Pertes de change',                'charge',  6, 'debiteur',  true),
  (1, '681', 'Dotations amortissements',        'charge',  6, 'debiteur',  true),
  -- CLASSE 7 — Produits
  (1, '7011','Ventes café',                     'produit', 7, 'crediteur', true),
  (1, '7012','Ventes hévéa',                    'produit', 7, 'crediteur', true),
  (1, '754', 'Dons et subventions reçus',       'produit', 7, 'crediteur', true),
  (1, '776', 'Gains de change',                 'produit', 7, 'crediteur', true),
  (1, '777', 'Subventions d''exploitation',     'produit', 7, 'crediteur', true)
ON CONFLICT (cooperative_id, numero_compte) DO NOTHING;

-- ④ Table paramètres comptes modules
CREATE TABLE IF NOT EXISTS parametres_comptes_modules (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER NOT NULL,
  module          VARCHAR(50) NOT NULL,
  operation       VARCHAR(100) NOT NULL,
  compte_debit    VARCHAR(20) NOT NULL,
  compte_credit   VARCHAR(20) NOT NULL,
  libelle_ecriture_auto VARCHAR(300),
  actif           BOOLEAN NOT NULL DEFAULT true,
  modifie_par     INTEGER REFERENCES users(id),
  updated_at      TIMESTAMP WITH TIME ZONE,
  UNIQUE(cooperative_id, module, operation)
);

-- ⑤ Seed paramètres comptes modules (valeurs OHADA par défaut)
INSERT INTO parametres_comptes_modules
  (cooperative_id, module, operation, compte_debit, compte_credit, libelle_ecriture_auto)
VALUES
  -- MODULE livraisons
  (1,'livraisons','achat_cacao_producteur',    '601',  '401', 'Achat cacao {fournisseur} - {date}'),
  (1,'livraisons','paiement_producteur_banque','401',  '521', 'Paiement {fournisseur} - {ref}'),
  (1,'livraisons','paiement_producteur_caisse','401',  '571', 'Paiement caisse {fournisseur}'),
  -- MODULE avances
  (1,'avances','octroi_avance_producteur',     '416',  '521', 'Avance {membre} - {date}'),
  (1,'avances','remboursement_avance',         '401',  '416', 'Remboursement avance {membre}'),
  -- MODULE ventes_export
  (1,'ventes_export','vente_cacao_exportateur','4111', '701', 'Vente lot {lot} à {exportateur}'),
  (1,'ventes_export','encaissement_exportateur','521', '4111','Encaissement {exportateur} - {ref}'),
  -- MODULE salaires
  (1,'salaires','salaire_brut',                '661',  '422', 'Salaires {mois} {annee}'),
  (1,'salaires','charges_sociales_patronales', '664',  '431', 'CNPS patronal {mois} {annee}'),
  (1,'salaires','paiement_salaire',            '422',  '521', 'Paiement salaires {mois}'),
  (1,'salaires','avance_personnel',            '425',  '521', 'Avance {employe} - {date}'),
  -- MODULE dons
  (1,'dons','don_effectue_especes',            '658',  '521', 'Don {categorie} - {beneficiaire}'),
  (1,'dons','don_effectue_nature',             '658',  '31',  'Don nature {designation}'),
  (1,'dons','don_recu_especes',                '521',  '754', 'Don reçu {donateur} - {date}'),
  (1,'dons','don_recu_nature',                 '31',   '754', 'Don nature reçu {donateur}'),
  -- MODULE intrants
  (1,'intrants','appro_intrants',              '31',   '401', 'Appro {intrant} - {fournisseur}'),
  (1,'intrants','distribution_credit',         '416',  '31',  'Intrants {intrant} à {membre}'),
  -- MODULE emprunts
  (1,'emprunts','reception_emprunt',           '521',  '164', 'Emprunt {preteur} - {ref}'),
  (1,'emprunts','remboursement_capital',       '164',  '521', 'Rembt capital {preteur}'),
  (1,'emprunts','paiement_interets',           '671',  '521', 'Intérêts {preteur} {mois}'),
  -- MODULE transport
  (1,'transport','frais_transport',            '624',  '521', 'Transport {mission} - {date}'),
  -- MODULE amortissements
  (1,'amortissements','dotation_mensuelle',    '681',  '284', 'Amort. {equipement} {mois}'),
  -- MODULE parts_sociales
  (1,'parts_sociales','liberation_parts',      '521',  '101', 'Parts sociales {membre}')
ON CONFLICT (cooperative_id, module, operation) DO NOTHING;

-- ⑥ Enrichir ecritures_comptables pour la traçabilité des corrections
ALTER TABLE ecritures_comptables
  ADD COLUMN IF NOT EXISTS type_ecriture      VARCHAR(20) NOT NULL DEFAULT 'normale',
  ADD COLUMN IF NOT EXISTS ecriture_source_id INTEGER REFERENCES ecritures_comptables(id),
  ADD COLUMN IF NOT EXISTS motif_correction   TEXT,
  ADD COLUMN IF NOT EXISTS corrige_par        INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS corrige_le         TIMESTAMP WITH TIME ZONE;
