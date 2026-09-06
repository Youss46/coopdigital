---
name: Schema check contracts
description: Every migration after the schema-check enforcement boundary needs a manifest contract and representative test fixture.
---

Les migrations postérieures à la frontière de contrôle doivent être déclarées dans `schema-checks.json`, et les fixtures du test d’intégration doivent créer les objets correspondants dans le schéma isolé. Toute colonne ajoutée au schéma Drizzle doit aussi avoir une migration SQL explicite, même si elle existe déjà dans une base historique.

**Why:** Le pré-déploiement refuse les migrations sans contrat; une base historique peut aussi manquer un objet pourtant marqué appliqué, ce qui doit être réparé par une migration idempotente.

**How to apply:** Après chaque nouvelle migration, ajouter son entrée au journal et au manifeste, compléter la fixture si nécessaire, puis exécuter la commande `ci-migrate` avant publication.