-- Statuts terminaux des avances accordées aux délégués.
ALTER TYPE "avance_delegue_statut" ADD VALUE IF NOT EXISTS 'annulee';
ALTER TYPE "avance_delegue_statut" ADD VALUE IF NOT EXISTS 'cloturee';