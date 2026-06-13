-- Migration 0023 : rattrapage schema drift 0017-0022
-- Toutes les instructions sont idempotentes (IF NOT EXISTS / IF NOT EXISTS)

-- 0017 : tonnage cible campagne
ALTER TABLE campagnes ADD COLUMN IF NOT EXISTS tonnage_cible_kg NUMERIC(14, 2);

-- 0018 : type caisse
ALTER TABLE caisses ADD COLUMN IF NOT EXISTS type_caisse varchar(10) NOT NULL DEFAULT 'centrale';
UPDATE caisses SET type_caisse = 'deleguee' WHERE responsable_id IS NOT NULL AND type_caisse = 'centrale';

-- 0019 : comptes bancaires
CREATE TABLE IF NOT EXISTS comptes_bancaires (
  id                      SERIAL PRIMARY KEY,
  cooperative_id          INTEGER NOT NULL,
  nom                     VARCHAR(200) NOT NULL,
  banque                  VARCHAR(100) NOT NULL,
  numero_compte           VARCHAR(50),
  iban                    VARCHAR(50),
  solde_actuel_fcfa       NUMERIC NOT NULL DEFAULT 0,
  solde_mini_alerte_fcfa  NUMERIC NOT NULL DEFAULT 0,
  actif                   BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mouvements_banque (
  id               SERIAL PRIMARY KEY,
  compte_id        INTEGER NOT NULL REFERENCES comptes_bancaires(id) ON DELETE CASCADE,
  cooperative_id   INTEGER NOT NULL,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  motif            VARCHAR(50) NOT NULL,
  montant_fcfa     NUMERIC NOT NULL,
  libelle          VARCHAR(300),
  reference        VARCHAR(100),
  date_operation   DATE NOT NULL,
  date_valeur      DATE,
  solde_apres_fcfa NUMERIC,
  rapproche        BOOLEAN NOT NULL DEFAULT false,
  enregistre_par   INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mouvements_banque_compte ON mouvements_banque(compte_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_banque_date   ON mouvements_banque(date_operation);
CREATE INDEX IF NOT EXISTS idx_comptes_bancaires_coop   ON comptes_bancaires(cooperative_id);

-- 0020 : expeditions
DO $$ BEGIN
  CREATE TYPE expedition_statut AS ENUM (
    'en_preparation', 'charge', 'en_transit',
    'arrive_port', 'receptionne', 'litige'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE expedition_type_vehicule AS ENUM ('propre', 'location');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE expedition_motif_ecart AS ENUM (
    'evaporation', 'vol', 'erreur_pesee', 'avarie', 'autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expeditions (
  id                    SERIAL PRIMARY KEY,
  cooperative_id        INTEGER NOT NULL REFERENCES cooperatives(id),
  numero_expedition     VARCHAR(30) NOT NULL UNIQUE,
  campagne_id           INTEGER REFERENCES campagnes(id),
  exercice_id           INTEGER,
  type_vehicule         expedition_type_vehicule NOT NULL,
  immatriculation       VARCHAR(50),
  nom_chauffeur         VARCHAR(200),
  telephone_chauffeur   VARCHAR(30),
  transporteur          VARCHAR(200),
  numero_bon_transport  VARCHAR(100),
  date_depart           TIMESTAMPTZ,
  lieu_depart           VARCHAR(255) DEFAULT 'Magasin central',
  poids_charge_kg       NUMERIC(12,2),
  nombre_sacs           INTEGER,
  numero_lots           TEXT,
  port                  VARCHAR(100) NOT NULL,
  entrepot_destination  VARCHAR(255),
  exportateur_id        INTEGER REFERENCES exportateurs(id),
  exportateur_nom       VARCHAR(255),
  numero_contrat_export VARCHAR(100),
  heure_estimee_arrivee TIMESTAMPTZ,
  position_gps_actuelle JSONB,
  date_arrivee_port     TIMESTAMPTZ,
  poids_recu_port_kg    NUMERIC(12,2),
  numero_recepisse_port VARCHAR(100),
  nom_receptionnaire    VARCHAR(200),
  statut_reception      VARCHAR(20),
  ecart_poids_kg        NUMERIC(12,2),
  motif_ecart           expedition_motif_ecart,
  provision_litige      BOOLEAN DEFAULT FALSE,
  documents             JSONB DEFAULT '[]',
  statut                expedition_statut NOT NULL DEFAULT 'en_preparation',
  ecriture_depart_id    INTEGER,
  ecriture_arrivee_id   INTEGER,
  ecriture_transport_id INTEGER,
  ecriture_ecart_id     INTEGER,
  cree_par              INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS expedition_lots (
  id               SERIAL PRIMARY KEY,
  expedition_id    INTEGER NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  membre_id        INTEGER REFERENCES membres(id),
  livraison_id     INTEGER REFERENCES livraisons(id),
  poids_kg         NUMERIC(12,2),
  nombre_sacs      INTEGER,
  certificat_eudr  VARCHAR(200),
  parcelle_origine VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS expedition_historique (
  id                SERIAL PRIMARY KEY,
  expedition_id     INTEGER NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  statut_precedent  VARCHAR(30),
  statut_nouveau    VARCHAR(30) NOT NULL,
  date_changement   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  fait_par          INTEGER,
  notes             TEXT,
  position_gps      JSONB
);

CREATE INDEX IF NOT EXISTS idx_expeditions_cooperative       ON expeditions(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_expeditions_statut            ON expeditions(cooperative_id, statut);
CREATE INDEX IF NOT EXISTS idx_expedition_lots_expedition    ON expedition_lots(expedition_id);
CREATE INDEX IF NOT EXISTS idx_expedition_historique_expedition ON expedition_historique(expedition_id);

-- 0021 : phytosanitaire + flotte
ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS vehicule_id                    INTEGER REFERENCES vehicules(id),
  ADD COLUMN IF NOT EXISTS chauffeur_id                   INTEGER REFERENCES chauffeurs(id),
  ADD COLUMN IF NOT EXISTS certificat_phyto_numero        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS certificat_phyto_date_emission DATE,
  ADD COLUMN IF NOT EXISTS certificat_phyto_date_expiration DATE,
  ADD COLUMN IF NOT EXISTS certificat_phyto_organisme     VARCHAR(200) DEFAULT 'DPVC';

-- 0022 : rattachement lot → expedition_lots
ALTER TABLE expedition_lots
  ADD COLUMN IF NOT EXISTS lot_id INTEGER REFERENCES lots(id);
