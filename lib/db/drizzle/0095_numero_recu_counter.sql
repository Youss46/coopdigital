-- Compteur séquentiel de réçus par coopérative
-- Incrémenté atomiquement à chaque nouveau paiement enregistré
ALTER TABLE cooperatives ADD COLUMN IF NOT EXISTS dernier_numero_recu integer NOT NULL DEFAULT 0;
