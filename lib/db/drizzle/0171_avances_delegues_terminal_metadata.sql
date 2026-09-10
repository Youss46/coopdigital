-- Termine les avances délégués sans supprimer leur créance ni leur historique.
ALTER TABLE "avances_delegues"
  ADD COLUMN IF NOT EXISTS "statut_action_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "statut_action_user_id" integer,
  ADD COLUMN IF NOT EXISTS "statut_action_reason" text,
  ADD COLUMN IF NOT EXISTS "montant_abandonne_fcfa" integer;

DO $$ BEGIN
  ALTER TABLE "avances_delegues"
    ADD CONSTRAINT "avances_delegues_statut_action_user_id_users_id_fk"
    FOREIGN KEY ("statut_action_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "avances_delegues"
    ADD CONSTRAINT "avances_delegues_terminal_metadata_check"
    CHECK (
      statut::text NOT IN ('annulee', 'cloturee')
      OR (
        statut_action_at IS NOT NULL
        AND statut_action_user_id IS NOT NULL
        AND statut_action_reason IS NOT NULL
        AND length(btrim(statut_action_reason)) > 0
        AND montant_abandonne_fcfa IS NOT NULL
        AND montant_abandonne_fcfa >= 0
        AND solde_restant_fcfa = 0
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;