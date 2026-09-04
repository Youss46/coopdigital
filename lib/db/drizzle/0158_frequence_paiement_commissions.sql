DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'commission_frequence_paiement'
  ) THEN
    CREATE TYPE commission_frequence_paiement AS ENUM ('chaque_paiement', 'fin_campagne');
  END IF;
END $$;

ALTER TABLE taux_commissions_membres_delegues
  ADD COLUMN IF NOT EXISTS frequence_paiement commission_frequence_paiement
    NOT NULL DEFAULT 'chaque_paiement';

ALTER TABLE commissions_membres_delegues
  ADD COLUMN IF NOT EXISTS frequence_paiement commission_frequence_paiement
    NOT NULL DEFAULT 'chaque_paiement';