---
name: migrate-fresh-db
description: Fix for Drizzle migration baseline on a fresh Replit dev DB — baseline must not be inserted when DB is empty.
---

# Fresh DB migration baseline trap

## Rule
`lib/db/src/migrate.ts` uses a `BASELINE_CREATED_AT` timestamp to skip migrations 0000–0023 (already applied via Railway push). On a fresh Replit dev DB, the baseline must NOT be inserted — all 104 migrations must run from 0000.

## Fix applied
`ensureBaseline()` now:
1. Checks if `cooperatives` table exists in `public` schema.
2. If DB is fresh → **delete** any leftover entries in `drizzle.__drizzle_migrations` (from a previous failed run) then return without inserting the baseline.
3. If DB already has tables → existing Railway/production logic applies.

**Why:** First failed run inserts the baseline entry even though no app tables were created. Without the DELETE, the second run reads the baseline entry and still skips 0000–0023 → 0024 fails with "relation users does not exist".

## How to apply
After any environment reset or new Replit DB provisioning, just restart the API workflow — the fix is self-healing. No manual SQL needed.
