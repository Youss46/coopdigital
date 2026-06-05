-- Migration 012 : Ajout colonne intrants_deduits_fcfa sur livraisons

ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS intrants_deduits_fcfa INTEGER NOT NULL DEFAULT 0;
