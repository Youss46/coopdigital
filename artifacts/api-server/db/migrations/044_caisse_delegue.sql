-- 044_caisse_delegue.sql — Module Caisse Déléguée

-- ① Tables de base (caisses déléguées)
CREATE TABLE IF NOT EXISTS caisses_delegues (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL REFERENCES users(id),
  cooperative_id          INTEGER NOT NULL REFERENCES cooperatives(id),
  solde                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  plafond                 NUMERIC(14,2),
  plafond_journalier_fcfa NUMERIC(14,2) DEFAULT 0,
  necessite_validation    BOOLEAN DEFAULT false,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_delegues_user ON caisses_delegues(user_id);
CREATE INDEX IF NOT EXISTS idx_caisses_delegues_coop ON caisses_delegues(cooperative_id);

-- ② Ajouter colonnes si migration partielle
ALTER TABLE caisses_delegues
  ADD COLUMN IF NOT EXISTS plafond_journalier_fcfa NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS necessite_validation BOOLEAN DEFAULT false;

-- ③ Mouvements caisse déléguée
CREATE TABLE IF NOT EXISTS mouvements_caisse_delegue (
  id                SERIAL PRIMARY KEY,
  caisse_delegue_id INTEGER NOT NULL REFERENCES caisses_delegues(id),
  type              TEXT NOT NULL,
  montant_fcfa      NUMERIC(14,2) NOT NULL,
  solde_apres_fcfa  NUMERIC(14,2) NOT NULL,
  livraison_id      INTEGER REFERENCES livraisons(id),
  note              TEXT,
  created_by_id     INTEGER REFERENCES users(id),
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mvt_delegue_caisse ON mouvements_caisse_delegue(caisse_delegue_id);
CREATE INDEX IF NOT EXISTS idx_mvt_delegue_date   ON mouvements_caisse_delegue(created_at);

-- ④ Table des alimentations de caisse déléguée (transfert caisse principale → déléguée)
CREATE TABLE IF NOT EXISTS alimentations_caisse_delegue (
  id                 SERIAL PRIMARY KEY,
  cooperative_id     INTEGER NOT NULL,
  caisse_delegue_id  INTEGER NOT NULL REFERENCES caisses_delegues(id),
  caisse_source_id   INTEGER REFERENCES caisses(id),
  montant_fcfa       NUMERIC(14,2) NOT NULL,
  motif              VARCHAR(300),
  statut             VARCHAR(20) NOT NULL DEFAULT 'confirme',
  envoye_par         INTEGER REFERENCES users(id),
  date_envoi         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes              TEXT,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alim_caisse_delegue_id ON alimentations_caisse_delegue(caisse_delegue_id);
CREATE INDEX IF NOT EXISTS idx_alim_caisse_source_id  ON alimentations_caisse_delegue(caisse_source_id);
CREATE INDEX IF NOT EXISTS idx_alim_coop_date         ON alimentations_caisse_delegue(cooperative_id, date_envoi);
