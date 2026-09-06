---
name: PostgreSQL integration schema drift
description: Les suites d’intégration peuvent tourner sur une base de test plus ancienne que le schéma Drizzle courant.
---

Les fixtures PostgreSQL d’intégration doivent pouvoir préparer de façon idempotente les colonnes ajoutées par une migration lorsqu’elles ciblent une base jetable partiellement migrée.

**Why:** Le workflow de validation peut réutiliser une base dont la structure est issue d’une ancienne baseline; le test échoue alors avant d’atteindre le comportement métier qu’il vérifie.

**How to apply:** Utiliser `ADD COLUMN IF NOT EXISTS` uniquement dans la préparation de la fixture, sans remplacer la migration de production ni masquer une erreur de schéma dans le code métier.

Les tests du vérificateur de schéma doivent créer leurs objets dans un schéma PostgreSQL temporaire plutôt que de supprimer des objets critiques de `public`.

**Why:** Une base de développement réutilisée peut manquer des index historiques que le manifeste exige; supprimer d’autres objets dans `public` rendrait le test destructif et non reproductible.

**How to apply:** Rejouer le manifeste avec le schéma remplacé par un identifiant temporaire, puis faire les suppressions d’index ou de contraintes dans une transaction rollbackée.
