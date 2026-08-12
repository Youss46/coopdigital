-- Migration 0073 : ajout auto_commissions à config_comptable
ALTER TABLE "config_comptable"
  ADD COLUMN IF NOT EXISTS "auto_commissions" boolean NOT NULL DEFAULT false;
