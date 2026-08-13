-- Migration 0077: Ajout du taux PF (Prestations Familiales) CNPS dans config_paie
-- Taux stocké ×100 (ex: 575 = 5,75 %)
ALTER TABLE "config_paie" ADD COLUMN "cnps_pf_taux" integer NOT NULL DEFAULT 575;
