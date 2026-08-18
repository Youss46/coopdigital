-- Migration 0104 : report_date sur avances_delegues
-- Permet de différer la retenue automatique sur commission jusqu'à une date précise
-- (comportement analogue à planType="reporte" + reportDate sur les avances membres).

ALTER TABLE avances_delegues ADD COLUMN IF NOT EXISTS report_date date;
