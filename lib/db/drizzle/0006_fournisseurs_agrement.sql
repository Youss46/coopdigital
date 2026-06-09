-- Migration 006: Champs agrément pisteurs sur la table fournisseurs
ALTER TABLE fournisseurs
  ADD COLUMN IF NOT EXISTS statut_agrement text DEFAULT 'agree',
  ADD COLUMN IF NOT EXISTS date_agrement date,
  ADD COLUMN IF NOT EXISTS date_expiration_agrement date;
