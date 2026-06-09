-- Migration : agent_terrain → delegue + colonnes zone

-- 1. Ajouter les nouvelles colonnes zone
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS zone_nom TEXT,
  ADD COLUMN IF NOT EXISTS zone_villages TEXT;

-- 2. Migrer les utilisateurs existants
UPDATE users SET role = 'delegue' WHERE role = 'agent_terrain';

-- 3. Mettre à jour la contrainte CHECK sur le rôle
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'pca',
    'directeur',
    'comptable',
    'magasinier',
    'responsable_tracabilite',
    'delegue',
    'auditeur'
  ));
