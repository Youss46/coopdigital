-- Migration 0098 : commissions délégués sur poids pesée physique au central.
-- livraisonId devient nullable (commission peut être liée à un transfert, pas une livraison).
-- transfertId est ajouté pour tracer la commission jusqu'à la pesée physique.

ALTER TABLE commissions_delegues
  ALTER COLUMN livraison_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS transfert_id integer REFERENCES transferts_stock(id);
