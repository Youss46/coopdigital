-- 035_planification_collectes.sql
-- Module de planification des collectes de cacao

-- ① Zones de collecte
CREATE TABLE IF NOT EXISTS zones_collecte (
  id                     SERIAL PRIMARY KEY,
  cooperative_id         INTEGER NOT NULL,
  nom                    VARCHAR(200) NOT NULL,
  section                VARCHAR(100),
  villages               TEXT[] DEFAULT '{}',
  agent_responsable_id   INTEGER REFERENCES users(id),
  objectif_tonnage_kg    NUMERIC DEFAULT 0,
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ② Plannings de collecte
CREATE TABLE IF NOT EXISTS plannings_collecte (
  id                     SERIAL PRIMARY KEY,
  cooperative_id         INTEGER NOT NULL,
  campagne_id            INTEGER REFERENCES campagnes(id),
  zone_collecte_id       INTEGER REFERENCES zones_collecte(id),
  agent_id               INTEGER REFERENCES users(id),
  date_collecte          DATE NOT NULL,
  heure_debut            TIME DEFAULT '07:00',
  heure_fin              TIME DEFAULT '17:00',
  villages_prevus        TEXT[] DEFAULT '{}',
  objectif_kg            NUMERIC DEFAULT 0,
  statut                 VARCHAR(20) NOT NULL DEFAULT 'planifie',
  tonnage_realise_kg     NUMERIC DEFAULT 0,
  nb_producteurs_prevus  INTEGER DEFAULT 0,
  nb_producteurs_venus   INTEGER DEFAULT 0,
  observations           TEXT,
  sms_envoye             BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP WITH TIME ZONE
);

-- ③ Notifications collecte
CREATE TABLE IF NOT EXISTS notifications_collecte (
  id              SERIAL PRIMARY KEY,
  planning_id     INTEGER NOT NULL REFERENCES plannings_collecte(id) ON DELETE CASCADE,
  membre_id       INTEGER REFERENCES membres(id),
  telephone       VARCHAR(30),
  message_envoye  TEXT,
  statut_envoi    VARCHAR(20),
  date_envoi      TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_plannings_cooperative_date   ON plannings_collecte(cooperative_id, date_collecte);
CREATE INDEX IF NOT EXISTS idx_plannings_zone               ON plannings_collecte(zone_collecte_id);
CREATE INDEX IF NOT EXISTS idx_plannings_agent              ON plannings_collecte(agent_id);
CREATE INDEX IF NOT EXISTS idx_notif_planning               ON notifications_collecte(planning_id);
