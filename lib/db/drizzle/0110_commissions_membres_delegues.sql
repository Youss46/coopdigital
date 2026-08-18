-- Migration 0110 : Commissions pour membres délégués de localités
-- Crée les tables de taux et de commissions pour les membres
-- dont categorie_membre = 'délégué de localités'

CREATE TABLE IF NOT EXISTS "taux_commissions_membres_delegues" (
  "id"                serial PRIMARY KEY,
  "cooperative_id"    integer NOT NULL REFERENCES "cooperatives"("id"),
  "campagne_id"       integer REFERENCES "campagnes"("id"),
  "membre_delegue_id" integer REFERENCES "membres"("id"),
  "taux_fcfa_par_kg"  numeric(10,4) NOT NULL,
  "date_debut"        date NOT NULL,
  "date_fin"          date,
  "actif"             boolean NOT NULL DEFAULT true,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "commissions_membres_delegues" (
  "id"                  serial PRIMARY KEY,
  "membre_delegue_id"   integer NOT NULL REFERENCES "membres"("id"),
  "session_pesee_id"    integer REFERENCES "sessions_pesee"("id"),
  "campagne_id"         integer REFERENCES "campagnes"("id"),
  "taux_fcfa_par_kg"    numeric(10,4) NOT NULL,
  "poids_kg"            numeric(10,2) NOT NULL,
  "montant_fcfa"        numeric(14,2) NOT NULL,
  "statut"              text NOT NULL DEFAULT 'en_attente',
  "date_paiement"       timestamptz,
  "mode_paiement"       text,
  "reference_paiement"  text,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);
