---
name: Drizzle migrations — schéma drizzle et pre-population
description: Drizzle stocke __drizzle_migrations dans le schéma SQL "drizzle" (pas "public"); logique LIMIT 1 ORDER BY created_at DESC pour sauter des migrations déjà appliquées manuellement.
---

## Règle

Drizzle's `migrate()` crée et lit `drizzle.__drizzle_migrations` (schéma `drizzle`, pas `public`).

**Why:** La source dans `pg-core/dialect.cjs` montre `migrationsSchema ?? "drizzle"` et
`SELECT … FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`.

**How to apply:**

Quand des migrations ont été appliquées manuellement (sans Drizzle) et que la table est vide, il faut:

1. `CREATE SCHEMA IF NOT EXISTS drizzle`
2. `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`
3. Insérer les enregistrements des migrations déjà appliquées avec les hash corrects.

Pour calculer les hash, utiliser `readMigrationFiles` de Drizzle:
```js
const { readMigrationFiles } = require('drizzle-orm/migrator');
const migrations = readMigrationFiles({ migrationsFolder: 'lib/db/drizzle' });
migrations.forEach(m => console.log(m.hash));
```

La logique de saut: une migration est SKIPPÉE si `lastMigration.created_at >= migration.folderMillis`.
Donc un seul enregistrement avec `created_at` = timestamp de la dernière migration appliquée suffit pour skipper toutes les précédentes.

## Validation locale après ajout d'une migration

Après l'ajout d'une migration, la base de développement doit l'avoir reçue avant d'exécuter directement les tests d'intégration ou une instance API déjà démarrée.

**Why:** Les tests peuvent atteindre la base avant le démarrage suivant de l'API, alors que l'API applique les migrations au lancement; les nouveaux enums ou colonnes provoquent alors des erreurs SQL trompeuses.

**How to apply:** Appliquer la migration de développement avec le script Drizzle du projet, puis relancer le test ciblé et redémarrer le workflow API si nécessaire.
