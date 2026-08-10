-- Migration 0067 : Ajout moyen_paiement et reference_paiement sur commissions_delegues
-- Le paiement des commissions passe désormais par un moyen de paiement explicite
-- (espèces, virement, chèque, orange_money, mtn_momo, wave)
-- plutôt que par un crédit automatique de la caisse interne du délégué.

ALTER TABLE commissions_delegues
  ADD COLUMN IF NOT EXISTS moyen_paiement   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS reference_paiement VARCHAR(100);
