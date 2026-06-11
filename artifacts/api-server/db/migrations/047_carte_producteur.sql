-- Ajout du champ "Numéro Carte producteur" (délivré par le Ministère de l'Agriculture)
ALTER TABLE membres ADD COLUMN IF NOT EXISTS carte_producteur VARCHAR(100);
