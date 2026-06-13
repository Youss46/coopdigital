-- Migration 0024 : tables manquantes absentes des migrations précédentes
-- Toutes les instructions sont idempotentes (IF NOT EXISTS)

-- ─── Caisses déléguées ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS caisses_delegues (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id),
  cooperative_id           INTEGER NOT NULL REFERENCES cooperatives(id),
  solde                    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  plafond                  NUMERIC(14, 2),
  plafond_journalier_fcfa  NUMERIC(14, 2) DEFAULT 0,
  necessite_validation     BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caisses_delegues_cooperative ON caisses_delegues(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_caisses_delegues_user        ON caisses_delegues(user_id);

-- ─── Mouvements caisse déléguée ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mouvements_caisse_delegue (
  id                 SERIAL PRIMARY KEY,
  caisse_delegue_id  INTEGER NOT NULL REFERENCES caisses_delegues(id),
  type               TEXT NOT NULL,
  montant_fcfa       NUMERIC(14, 2) NOT NULL,
  solde_apres_fcfa   NUMERIC(14, 2) NOT NULL,
  livraison_id       INTEGER REFERENCES livraisons(id),
  note               TEXT,
  created_by_id      INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mvts_caisse_delegue_caisse ON mouvements_caisse_delegue(caisse_delegue_id);

-- ─── Alimentations caisse déléguée ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alimentations_caisse_delegue (
  id                 SERIAL PRIMARY KEY,
  cooperative_id     INTEGER NOT NULL,
  caisse_delegue_id  INTEGER NOT NULL REFERENCES caisses_delegues(id),
  caisse_source_id   INTEGER REFERENCES caisses(id),
  montant_fcfa       NUMERIC(14, 2) NOT NULL,
  motif              VARCHAR(300),
  statut             VARCHAR(20) NOT NULL DEFAULT 'confirme',
  envoye_par         INTEGER REFERENCES users(id),
  date_envoi         TIMESTAMPTZ DEFAULT NOW(),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alimentations_cd_cooperative ON alimentations_caisse_delegue(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_alimentations_cd_caisse      ON alimentations_caisse_delegue(caisse_delegue_id);

-- ─── Messagerie interne ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages_internes (
  id                SERIAL PRIMARY KEY,
  cooperative_id    INTEGER NOT NULL REFERENCES cooperatives(id),
  auteur_id         INTEGER REFERENCES users(id),
  sujet             TEXT NOT NULL,
  contenu           TEXT NOT NULL,
  destinataires     TEXT NOT NULL DEFAULT 'tous',
  nb_destinataires  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_internes_cooperative ON messages_internes(cooperative_id);

-- ─── Lectures messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lectures_messages (
  id          SERIAL PRIMARY KEY,
  message_id  INTEGER NOT NULL REFERENCES messages_internes(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  lu_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lectures_messages_message ON lectures_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_lectures_messages_user    ON lectures_messages(user_id);

-- ─── Push subscriptions portail membres ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions_portail (
  id          SERIAL PRIMARY KEY,
  membre_id   INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (membre_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_portail_membre ON push_subscriptions_portail(membre_id);
