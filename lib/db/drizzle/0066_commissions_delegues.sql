-- Migration 0066 : Tables de commissions pour les délégués de localité
-- taux_commissions_delegues : configuration des taux (FCFA/kg) par coopérative/campagne/délégué
-- commissions_delegues      : une commission calculée par livraison

CREATE TABLE IF NOT EXISTS "taux_commissions_delegues" (
  "id"              serial PRIMARY KEY NOT NULL,
  "cooperative_id"  integer NOT NULL REFERENCES "cooperatives"("id"),
  "campagne_id"     integer REFERENCES "campagnes"("id"),
  "delegue_id"      integer REFERENCES "users"("id"),
  "taux_fcfa_par_kg" numeric(10, 4) NOT NULL,
  "date_debut"      date NOT NULL,
  "date_fin"        date,
  "actif"           boolean NOT NULL DEFAULT true,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commissions_delegues" (
  "id"              serial PRIMARY KEY NOT NULL,
  "delegue_id"      integer NOT NULL REFERENCES "users"("id"),
  "livraison_id"    integer NOT NULL REFERENCES "livraisons"("id"),
  "campagne_id"     integer REFERENCES "campagnes"("id"),
  "taux_fcfa_par_kg" numeric(10, 4) NOT NULL,
  "poids_kg"        numeric(10, 2) NOT NULL,
  "montant_fcfa"    numeric(14, 2) NOT NULL,
  "statut"          text NOT NULL DEFAULT 'en_attente',
  "date_paiement"   timestamptz,
  "mouvement_id"    integer REFERENCES "mouvements_caisse_delegue"("id"),
  "created_at"      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_commissions_delegue_id"   ON "commissions_delegues"("delegue_id");
CREATE INDEX IF NOT EXISTS "idx_commissions_livraison_id" ON "commissions_delegues"("livraison_id");
CREATE INDEX IF NOT EXISTS "idx_commissions_statut"       ON "commissions_delegues"("statut");
