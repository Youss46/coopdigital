-- PostgreSQL exige que les nouvelles valeurs d'enum soient validées avant
-- d'être utilisées par une contrainte dans une migration suivante.
ALTER TYPE "avance_statut" ADD VALUE IF NOT EXISTS 'annulee';
ALTER TYPE "avance_statut" ADD VALUE IF NOT EXISTS 'cloturee';