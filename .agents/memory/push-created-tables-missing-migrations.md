---
name: Tables créées via drizzle push absentes des migrations
description: Certaines tables historiques n'ont aucun CREATE TABLE dans lib/db/drizzle; toute migration qui les ALTER doit les créer d'abord
---

Règle : certaines tables (ex. `bons_reception_membres_delegues`) ont été créées historiquement via `drizzle-kit push` et n'apparaissent dans AUCUNE migration SQL. Une base vierge (dev Replit) échoue dès qu'une migration ultérieure fait `ALTER TABLE` dessus.

**Why:** en août 2026, la migration de traçabilité du créateur de bon échouait sur DB vierge avec « relation bons_reception_membres_delegues does not exist » alors que Railway (où push avait tourné) passait.

**How to apply:** avant d'écrire une migration qui ALTER une table, vérifier `rg -l '"<table>"' lib/db/drizzle/*.sql` qu'un CREATE TABLE existe. Sinon, préfixer la migration d'un `CREATE TABLE IF NOT EXISTS` complet (copié du schéma Drizzle) — no-op sur les bases existantes, et garder tous les ALTER/CREATE INDEX idempotents (IF NOT EXISTS).
