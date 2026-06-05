---
name: Orval YAML path prefix rule
description: OpenAPI YAML paths must not repeat the server base URL; servers.url handles the prefix automatically.
---

## Rule

Paths in `lib/api-spec/openapi.yaml` must **not** include the server base URL prefix.

The spec has:
```yaml
servers:
  - url: /api
```

So a path like `/audit/journal` is correct — orval generates URL `/api/audit/journal`.

A path like `/api/audit/journal` causes orval to generate **double-prefix** URL `/api/api/audit/journal`, which never hits the backend.

## Pattern

✅ Correct: `/audit/journal`, `/membres`, `/avances`
❌ Wrong: `/api/audit/journal`, `/api/membres`

**Why:** Orval prepends the server URL to each path when generating the URL builder functions.

**How to apply:** When adding new paths to `openapi.yaml`, always start from the resource name (no leading `/api/`). After adding paths, run `pnpm --filter @workspace/api-spec run codegen` and grep generated URLs for double `/api/api/` to catch mistakes early.
