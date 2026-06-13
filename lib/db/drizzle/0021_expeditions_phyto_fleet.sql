-- Migration 0021 : Certificat phytosanitaire + liens flotte transport

ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS vehicule_id  INTEGER REFERENCES vehicules(id),
  ADD COLUMN IF NOT EXISTS chauffeur_id INTEGER REFERENCES chauffeurs(id),
  ADD COLUMN IF NOT EXISTS certificat_phyto_numero      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS certificat_phyto_date_emission DATE,
  ADD COLUMN IF NOT EXISTS certificat_phyto_date_expiration DATE,
  ADD COLUMN IF NOT EXISTS certificat_phyto_organisme   VARCHAR(200) DEFAULT 'DPVC';
