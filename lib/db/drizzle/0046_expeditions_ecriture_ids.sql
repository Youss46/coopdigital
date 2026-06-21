-- 0046 : Colonnes de liaison comptable manquantes sur la table expeditions
-- Ces colonnes étaient dans les CREATE TABLE IF NOT EXISTS (0020/0023/0025/0028)
-- mais jamais ajoutées via ALTER TABLE — elles manquaient sur Railway.
ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS ecriture_depart_id    INTEGER,
  ADD COLUMN IF NOT EXISTS ecriture_arrivee_id   INTEGER,
  ADD COLUMN IF NOT EXISTS ecriture_transport_id INTEGER,
  ADD COLUMN IF NOT EXISTS ecriture_ecart_id     INTEGER;
