-- Migration 0100 : déduction des charges de transport des commissions délégués.
-- montant_brut_fcfa  = poidsKg × taux (avant déduction)
-- charges_deduites_fcfa = frais_carburant + autres_charges du transfert associé
-- montant_fcfa       = montant net (déjà existant, maintenant = brut - charges)

ALTER TABLE commissions_delegues
  ADD COLUMN IF NOT EXISTS montant_brut_fcfa     numeric(14, 2),
  ADD COLUMN IF NOT EXISTS charges_deduites_fcfa integer;
