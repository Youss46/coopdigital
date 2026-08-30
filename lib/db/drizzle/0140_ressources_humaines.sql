ALTER TABLE personnel ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS contact_urgence_nom TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS contact_urgence_telephone TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS notes_rh TEXT;

CREATE INDEX IF NOT EXISTS personnel_user_id_idx ON personnel(user_id);

CREATE TABLE IF NOT EXISTS rh_contrats (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  type VARCHAR(30) NOT NULL,
  reference VARCHAR(100),
  date_debut DATE NOT NULL,
  date_fin DATE,
  date_signature DATE,
  statut VARCHAR(20) NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'resilie', 'expire')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_contrats_coop_personnel_idx ON rh_contrats(cooperative_id, personnel_id);
CREATE INDEX IF NOT EXISTS rh_contrats_date_fin_idx ON rh_contrats(cooperative_id, date_fin);

CREATE TABLE IF NOT EXISTS rh_documents (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  type VARCHAR(40) NOT NULL,
  titre VARCHAR(180) NOT NULL,
  reference VARCHAR(100),
  date_document DATE,
  date_expiration DATE,
  url TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_documents_coop_personnel_idx ON rh_documents(cooperative_id, personnel_id);
CREATE INDEX IF NOT EXISTS rh_documents_expiration_idx ON rh_documents(cooperative_id, date_expiration);

CREATE TABLE IF NOT EXISTS rh_conges (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  type VARCHAR(30) NOT NULL DEFAULT 'annuel',
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  jours INTEGER NOT NULL CHECK (jours > 0),
  motif TEXT,
  statut VARCHAR(20) NOT NULL DEFAULT 'demande'
    CHECK (statut IN ('demande', 'approuve', 'refuse', 'annule')),
  demandeur_id INTEGER REFERENCES users(id),
  valide_par INTEGER REFERENCES users(id),
  valide_at TIMESTAMPTZ,
  commentaire_validation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_conges_coop_personnel_idx ON rh_conges(cooperative_id, personnel_id);
CREATE INDEX IF NOT EXISTS rh_conges_statut_idx ON rh_conges(cooperative_id, statut);

CREATE TABLE IF NOT EXISTS rh_absences (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  type VARCHAR(30) NOT NULL DEFAULT 'justifiee',
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  jours INTEGER NOT NULL CHECK (jours > 0),
  motif TEXT,
  justificatif_url TEXT,
  statut VARCHAR(20) NOT NULL DEFAULT 'signalee'
    CHECK (statut IN ('signalee', 'validee', 'refusee')),
  valide_par INTEGER REFERENCES users(id),
  valide_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_absences_coop_personnel_idx ON rh_absences(cooperative_id, personnel_id);
CREATE INDEX IF NOT EXISTS rh_absences_statut_idx ON rh_absences(cooperative_id, statut);

CREATE TABLE IF NOT EXISTS rh_historique (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  personnel_id INTEGER REFERENCES personnel(id),
  entite VARCHAR(40) NOT NULL,
  entite_id INTEGER,
  action VARCHAR(40) NOT NULL,
  details JSONB,
  fait_par INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_historique_coop_idx ON rh_historique(cooperative_id, created_at);
CREATE INDEX IF NOT EXISTS rh_historique_personnel_idx ON rh_historique(cooperative_id, personnel_id);