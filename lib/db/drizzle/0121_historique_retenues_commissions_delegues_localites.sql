-- Historique des remboursements d'avances issus du paiement
-- des commissions des membres délégués de localités.
ALTER TABLE "remboursements_avances_membres"
  ADD COLUMN IF NOT EXISTS "commission_membre_delegue_id" integer
  REFERENCES "commissions_membres_delegues"("id") ON DELETE SET NULL;