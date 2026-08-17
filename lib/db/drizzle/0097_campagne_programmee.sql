-- Migration 0097 : statut "programmee" pour les campagnes planifiées à une date future.
-- PostgreSQL ne supporte pas DROP VALUE, donc on ajoute uniquement.
ALTER TYPE campagne_statut ADD VALUE IF NOT EXISTS 'programmee' BEFORE 'ouverte';
