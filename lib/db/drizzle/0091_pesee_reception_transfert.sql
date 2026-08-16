-- Migration 0091: pesée physique obligatoire à la réception des transferts
-- Ajoute le statut 'en_pesee' au cycle de vie des transferts,
-- et les FK croisées entre sessions_pesee et transferts_stock.

-- 1. Nouveau statut dans l'enum transfert_statut
ALTER TYPE "transfert_statut" ADD VALUE IF NOT EXISTS 'en_pesee';

--> statement-breakpoint

-- 2. Lien de transferts_stock vers la session de pesée de réception
ALTER TABLE "transferts_stock" ADD COLUMN IF NOT EXISTS "session_pesee_id" integer;

--> statement-breakpoint

-- 3. Lien de sessions_pesee vers le transfert concerné
ALTER TABLE "sessions_pesee" ADD COLUMN IF NOT EXISTS "transfert_id" integer;
