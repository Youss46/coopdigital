-- Migration 030 : SaaS — Plans, Licences, Utilisateurs M15 Tech

-- ─── m15_users : équipe M15 Tech (séparée des users coopérative) ─────────────
CREATE TABLE IF NOT EXISTS m15_users (
  id              SERIAL PRIMARY KEY,
  nom             VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'support',
  actif           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── plans_abonnement ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans_abonnement (
  id                SERIAL PRIMARY KEY,
  nom               VARCHAR(50) NOT NULL,
  prix_1an_fcfa     NUMERIC(12,2),
  prix_2ans_fcfa    NUMERIC(12,2),
  prix_3ans_fcfa    NUMERIC(12,2),
  prix_5ans_fcfa    NUMERIC(12,2),
  nb_membres_max    INTEGER,
  nb_users_max      INTEGER,
  modules_inclus    TEXT[],
  stockage_go       INTEGER,
  support           VARCHAR(50),
  actif             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── licences ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licences (
  id                            SERIAL PRIMARY KEY,
  cooperative_id                INTEGER REFERENCES cooperatives(id),
  plan_id                       INTEGER REFERENCES plans_abonnement(id),

  cle_licence                   VARCHAR(40) NOT NULL UNIQUE,

  duree_ans                     INTEGER NOT NULL,
  date_activation               DATE,
  date_expiration               DATE,

  renouvellement_auto           BOOLEAN NOT NULL DEFAULT false,
  date_dernier_renouvellement   DATE,
  nb_renouvellements            INTEGER NOT NULL DEFAULT 0,

  trial_actif                   BOOLEAN NOT NULL DEFAULT false,
  duree_trial_jours             INTEGER NOT NULL DEFAULT 30,
  date_fin_trial                DATE,

  statut                        VARCHAR(20) NOT NULL DEFAULT 'inactive',

  motif_suspension              TEXT,
  date_suspension               TIMESTAMP WITH TIME ZONE,
  suspendu_par                  INTEGER REFERENCES m15_users(id),

  motif_suppression             TEXT,
  date_suppression              TIMESTAMP WITH TIME ZONE,
  supprime_par                  INTEGER REFERENCES m15_users(id),
  donnees_archivees             BOOLEAN NOT NULL DEFAULT false,

  montant_paye_fcfa             NUMERIC(12,2),
  mode_paiement                 VARCHAR(50),
  reference_paiement            VARCHAR(100),
  facture_url                   VARCHAR(500),

  cree_par                      INTEGER REFERENCES m15_users(id),
  notes_internes                TEXT,

  created_at                    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── historique_licences ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historique_licences (
  id              SERIAL PRIMARY KEY,
  licence_id      INTEGER REFERENCES licences(id),
  cooperative_id  INTEGER REFERENCES cooperatives(id),
  action          VARCHAR(50) NOT NULL,
  ancien_statut   VARCHAR(20),
  nouveau_statut  VARCHAR(20),
  details         JSONB,
  effectue_par    INTEGER REFERENCES m15_users(id),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_licences_cooperative ON licences(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_licences_statut ON licences(statut);
CREATE INDEX IF NOT EXISTS idx_licences_expiration ON licences(date_expiration);
CREATE INDEX IF NOT EXISTS idx_historique_licences_licence ON historique_licences(licence_id);
CREATE INDEX IF NOT EXISTS idx_historique_licences_coop ON historique_licences(cooperative_id);

-- ─── Seed plans ───────────────────────────────────────────────────────────────
INSERT INTO plans_abonnement (nom, prix_1an_fcfa, prix_2ans_fcfa, prix_3ans_fcfa, prix_5ans_fcfa, nb_membres_max, nb_users_max, modules_inclus, stockage_go, support, actif)
VALUES
  ('Starter',    250000,  450000,  600000,  900000,  300,  8,  ARRAY['membres','avances','livraisons'], 5, 'email', true),
  ('Pro',        600000, 1080000, 1440000, 2100000, 1000, 20, ARRAY['membres','avances','livraisons','lots','exportateurs','rapport'], 20, 'whatsapp', true),
  ('Enterprise', 1500000,2700000, 3600000, 5250000, NULL, NULL, ARRAY['membres','avances','livraisons','lots','exportateurs','rapport','comptabilite','salaires','gouvernance'], 100, 'prioritaire', true)
ON CONFLICT DO NOTHING;

-- ─── Seed M15 superadmin (mot de passe : M15Tech1234!) ───────────────────────
INSERT INTO m15_users (nom, email, password_hash, role)
VALUES ('M15 Tech', 'admin@m15tech.ci', '$2b$10$hN.Z3Wbgjg2x8aGxfqOcwumoqJSYgaj2DpJU7Hr2IHJEPhvEiaj22', 'superadmin')
ON CONFLICT (email) DO NOTHING;

-- ─── Seed licence Pro 3 ans pour la coopérative 1 (démo) ─────────────────────
INSERT INTO licences (cooperative_id, plan_id, cle_licence, duree_ans, date_activation, date_expiration, statut, montant_paye_fcfa, mode_paiement, notes_internes)
SELECT 1, p.id, 'M15-DEMO-COOP-0001-2026', 3, '2026-01-01', '2029-01-01', 'active', 1440000, 'virement', 'Licence démo développement CoopDigital'
FROM plans_abonnement p WHERE p.nom = 'Pro'
ON CONFLICT (cle_licence) DO NOTHING;
