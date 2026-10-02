---
name: Schema check contracts
description: Every migration after the schema-check enforcement boundary needs a manifest contract and representative test fixture.
---

Les migrations postérieures à la frontière de contrôle doivent être déclarées dans `schema-checks.json`, et les fixtures du test d’intégration doivent créer les objets correspondants dans le schéma isolé. Toute colonne ajoutée au schéma Drizzle doit aussi avoir une migration SQL explicite, même si elle existe déjà dans une base historique.

Le manifeste `schema-checks.json` est un fichier de projet, pas un snapshot Drizzle. Dans ce dépôt, `drizzle-kit generate` tente de le lire comme un snapshot et échoue avec `data is malformed`; ne pas supprimer ni renommer le manifeste pour contourner l’erreur. Créer la migration SQL et son entrée de journal manuellement.

**Why:** Le pré-déploiement refuse les migrations sans contrat; une base historique peut aussi manquer un objet pourtant marqué appliqué, ce qui doit être réparé par une migration idempotente. La génération Drizzle ne sait pas lire le manifeste personnalisé.

**How to apply:** Après chaque nouvelle migration, ajouter son entrée au journal et au manifeste, compléter la fixture si nécessaire, exécuter le test d’intégration du contrôle de schéma, puis valider `ci-migrate` avant publication.