---
name: PostgreSQL integration schema drift
description: Les suites d’intégration peuvent tourner sur une base de test plus ancienne que le schéma Drizzle courant.
---

Les fixtures PostgreSQL d’intégration doivent pouvoir préparer de façon idempotente les colonnes ajoutées par une migration lorsqu’elles ciblent une base jetable partiellement migrée.

**Why:** Le workflow de validation peut réutiliser une base dont la structure est issue d’une ancienne baseline; le test échoue alors avant d’atteindre le comportement métier qu’il vérifie.

**How to apply:** Utiliser `ADD COLUMN IF NOT EXISTS` uniquement dans la préparation de la fixture, sans remplacer la migration de production ni masquer une erreur de schéma dans le code métier.