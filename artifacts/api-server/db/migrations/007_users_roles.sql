-- 007_users_roles.sql
-- Remplacement du système de rôles par la hiérarchie OHADA

-- 1. Mettre le compte admin existant en PCA avant conversion
UPDATE users SET role = 'pca' WHERE email = 'admin@coopdigital.ci';

-- 2. Convertir la colonne role de pgEnum vers varchar(30)
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(30) USING role::text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'agent_terrain';

-- 3. Supprimer l'ancien type enum
DROP TYPE IF EXISTS user_role;

-- 4. Ajouter la colonne telephone
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone VARCHAR(20);

-- 5. Contrainte : un seul PCA actif par coopérative
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pca_cooperative
  ON users(cooperative_id)
  WHERE role = 'pca' AND actif = true;
