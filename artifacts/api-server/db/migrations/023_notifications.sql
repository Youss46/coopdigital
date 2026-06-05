-- Migration 023 — Centre de notifications

CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  cooperative_id  INTEGER REFERENCES cooperatives(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  type            VARCHAR(50)  NOT NULL,
  titre           VARCHAR(255) NOT NULL,
  message         TEXT         NOT NULL,
  lien            VARCHAR(500),
  lien_libelle    VARCHAR(100),
  gravite         VARCHAR(20)  NOT NULL DEFAULT 'info'
                    CHECK (gravite IN ('info','attention','critique')),
  lu              BOOLEAN      NOT NULL DEFAULT false,
  date_lu         TIMESTAMP WITH TIME ZONE,
  source_module   VARCHAR(50),
  source_id       INTEGER,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preferences_notifications (
  id                              SERIAL PRIMARY KEY,
  user_id                         INTEGER NOT NULL REFERENCES users(id),
  cooperative_id                  INTEGER REFERENCES cooperatives(id),
  notif_stock_faible              BOOLEAN NOT NULL DEFAULT true,
  notif_avance_retard             BOOLEAN NOT NULL DEFAULT true,
  notif_creance_retard            BOOLEAN NOT NULL DEFAULT true,
  notif_refus_non_traite          BOOLEAN NOT NULL DEFAULT true,
  notif_anomalie_critique         BOOLEAN NOT NULL DEFAULT true,
  notif_certification_expiration  BOOLEAN NOT NULL DEFAULT true,
  notif_echeance_emprunt          BOOLEAN NOT NULL DEFAULT true,
  notif_bulletin_attente          BOOLEAN NOT NULL DEFAULT true,
  notif_ecriture_attente          BOOLEAN NOT NULL DEFAULT true,
  notif_ag_planifiee              BOOLEAN NOT NULL DEFAULT true,
  notif_message_recu              BOOLEAN NOT NULL DEFAULT true,
  notif_budget_depasse            BOOLEAN NOT NULL DEFAULT true,
  notif_prix_change               BOOLEAN NOT NULL DEFAULT true,
  recevoir_sms                    BOOLEAN NOT NULL DEFAULT false,
  recevoir_email                  BOOLEAN NOT NULL DEFAULT false,
  updated_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_coop_id     ON notifications(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lu          ON notifications(lu);
CREATE INDEX IF NOT EXISTS idx_notifications_gravite     ON notifications(gravite);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pref_notif_user_coop
  ON preferences_notifications(user_id, COALESCE(cooperative_id, 0));
