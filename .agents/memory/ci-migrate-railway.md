---
name: CI Railway migration — ci-migrate.ts
description: drizzle-kit push --force échoue en CI (TTY prompt); solution robuste via script custom combinant baseline Drizzle + drizzle-orm/migrator.
---

## Règle

Ne jamais utiliser `drizzle-kit push --force` en CI/CD. Utiliser `pnpm --filter @workspace/db run ci-migrate` à la place.

**Why:** `drizzle-kit push --force` n'est pas vraiment "force" — il demande confirmation pour toutes les opérations destructives (TRUNCATE, etc.) via prompt interactif. En CI sans TTY → erreur silencieuse, exit code 0 parfois, push partiel garanti.

**How to apply:**

Le script `lib/db/src/ci-migrate.ts` fait en une passe :
1. `CREATE SCHEMA IF NOT EXISTS drizzle`
2. `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (...)`
3. Si `MAX(created_at) < BASELINE_CREATED_AT` → insère un enregistrement de baseline
4. Appelle `drizzle-orm/migrator` → applique seulement les migrations en attente

## Baseline timestamp — point critique

Les timestamps `when` dans `_journal.json` sont **non-monotones** : migrations 0000-0003 ont des `when` autour de `178x` (grand), migrations 0004-0022 ont des `when` autour de `174x` (petit).

Drizzle skip logic : `lastRecord.created_at >= migration.folderMillis` (ORDER BY created_at DESC LIMIT 1).

Pour skipper 0000-0023, le baseline doit être ≥ MAX(when de 0000-0023) = `1781348700000` (when de migration 0023).

Si le baseline est trop bas (ex: 0018.when = 1749990000000), migrations 0001-0003 (who have when > 1749990000000) ne seront PAS skippées → conflit sur colonnes existantes.

## Piège "Railway DB créée via push"

Quand la DB Railway a été initialisée via `drizzle-kit push` (pas migrate) :
- `drizzle.__drizzle_migrations` peut ne pas exister, ou avoir 1-2 enregistrements partiels
- Les tables existent en DB mais ne sont pas tracées comme "migrées"
- Résultat : `drizzle-kit migrate` tente de re-créer tout depuis 0000 → conflits

Solution : baseline script détecte `MAX(created_at) < BASELINE_CREATED_AT` et insère un enregistrement de rattrapage. La condition doit être `MAX < BASELINE`, pas seulement `count = 0`.

## Migrations avec baseline skippé → tables manquantes

Si le baseline skipppe des migrations (ex: 0019-0023) dont le contenu n'a pas été appliqué sur Railway (push partiel), les tables de ces migrations seront absentes. Créer une migration "catch-all" idempotente (IF NOT EXISTS) pour les rattraper, avec `when` > MAX(when actuel).

En dernier recours : exécuter le SQL directement dans la console Railway Postgres (onglet Query).
