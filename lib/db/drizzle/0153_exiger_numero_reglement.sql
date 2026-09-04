ALTER TABLE "paiements"
  ADD CONSTRAINT "paiements_cooperative_numero_recu_check"
  CHECK ("cooperative_id" IS NULL OR "numero_recu" IS NOT NULL);