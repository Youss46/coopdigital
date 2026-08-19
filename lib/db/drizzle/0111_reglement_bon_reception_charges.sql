-- Ventilation immuable du règlement des livraisons issues d'un bon de réception.
-- Les colonnes permettent de réconcilier bordereau, paiement et comptabilité.
ALTER TABLE "livraisons"
  ADD COLUMN IF NOT EXISTS "frais_carburant_avances_fcfa" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autres_charges_avancees_fcfa" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "frais_carburant_deduits_fcfa" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autres_charges_deduites_fcfa" integer NOT NULL DEFAULT 0;