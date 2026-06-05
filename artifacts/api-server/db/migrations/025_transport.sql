-- Migration 025: Module Transport (véhicules, chauffeurs, missions, entretiens)

CREATE TABLE IF NOT EXISTS vehicules (
  id                          SERIAL PRIMARY KEY,
  cooperative_id              INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  immatriculation             VARCHAR(50) NOT NULL,
  marque                      VARCHAR(100),
  modele                      VARCHAR(100),
  type                        VARCHAR(20) NOT NULL CHECK (type IN ('camion','camionnette','moto','tracteur')),
  capacite_kg                 NUMERIC(10,2),
  annee_fabrication           INTEGER,
  date_acquisition            DATE,
  valeur_acquisition_fcfa     NUMERIC(14,2),
  proprietaire                VARCHAR(20) NOT NULL DEFAULT 'cooperative'
                                CHECK (proprietaire IN ('cooperative','location','prestataire')),
  nom_prestataire             VARCHAR(255),
  statut                      VARCHAR(20) NOT NULL DEFAULT 'disponible'
                                CHECK (statut IN ('disponible','en_mission','en_panne','maintenance')),
  kilometrage_actuel          INTEGER NOT NULL DEFAULT 0,
  prochain_entretien_km       INTEGER,
  prochain_entretien_date     DATE,
  assurance_expiration        DATE,
  visite_technique_expiration DATE,
  photo_url                   VARCHAR(500),
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(cooperative_id, immatriculation)
);

CREATE TABLE IF NOT EXISTS chauffeurs (
  id                        SERIAL PRIMARY KEY,
  cooperative_id            INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  nom                       VARCHAR(100) NOT NULL,
  prenoms                   VARCHAR(200),
  telephone                 VARCHAR(30),
  numero_permis             VARCHAR(100),
  categorie_permis          VARCHAR(10),
  date_expiration_permis    DATE,
  date_embauche             DATE,
  statut                    VARCHAR(10) NOT NULL DEFAULT 'actif'
                              CHECK (statut IN ('actif','inactif')),
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS missions_transport (
  id                        SERIAL PRIMARY KEY,
  cooperative_id            INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  vehicule_id               INTEGER NOT NULL REFERENCES vehicules(id),
  chauffeur_id              INTEGER NOT NULL REFERENCES chauffeurs(id),
  campagne_id               INTEGER,
  type_mission              VARCHAR(20) NOT NULL
                              CHECK (type_mission IN ('collecte','livraison_export','intrants','autre')),
  zone_collecte             VARCHAR(255),
  section                   VARCHAR(255),
  vente_exportateur_id      INTEGER,
  exportateur_destination   VARCHAR(255),
  lieu_depart               VARCHAR(255) NOT NULL,
  lieu_arrivee              VARCHAR(255) NOT NULL,
  date_depart               TIMESTAMP WITH TIME ZONE NOT NULL,
  date_arrivee_prevue       TIMESTAMP WITH TIME ZONE,
  date_arrivee_reelle       TIMESTAMP WITH TIME ZONE,
  poids_charge_kg           NUMERIC(12,3) NOT NULL DEFAULT 0,
  nombre_sacs               INTEGER NOT NULL DEFAULT 0,
  kilometrage_depart        INTEGER,
  kilometrage_arrivee       INTEGER,
  distance_km               INTEGER,
  cout_carburant_fcfa       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cout_chauffeur_fcfa       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cout_peage_fcfa           NUMERIC(12,2) NOT NULL DEFAULT 0,
  cout_divers_fcfa          NUMERIC(12,2) NOT NULL DEFAULT 0,
  cout_total_fcfa           NUMERIC(14,2) NOT NULL DEFAULT 0,
  cout_par_kg_fcfa          NUMERIC(10,4),
  statut                    VARCHAR(20) NOT NULL DEFAULT 'planifiee'
                              CHECK (statut IN ('planifiee','en_cours','terminee','annulee')),
  observations              TEXT,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS entretiens_vehicule (
  id                        SERIAL PRIMARY KEY,
  vehicule_id               INTEGER NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
  type_entretien            VARCHAR(50) NOT NULL,
  date_entretien            DATE NOT NULL,
  kilometrage_entretien     INTEGER,
  description               TEXT,
  cout_fcfa                 NUMERIC(12,2),
  garage                    VARCHAR(255),
  prochain_entretien_km     INTEGER,
  prochain_entretien_date   DATE,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicules_coop   ON vehicules(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_vehicules_statut ON vehicules(statut);
CREATE INDEX IF NOT EXISTS idx_chauffeurs_coop  ON chauffeurs(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_missions_coop    ON missions_transport(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_missions_vehicule ON missions_transport(vehicule_id);
CREATE INDEX IF NOT EXISTS idx_missions_chauffeur ON missions_transport(chauffeur_id);
CREATE INDEX IF NOT EXISTS idx_missions_statut  ON missions_transport(statut);
CREATE INDEX IF NOT EXISTS idx_entretiens_vehicule ON entretiens_vehicule(vehicule_id);
