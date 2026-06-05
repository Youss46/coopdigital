---
name: API route prefix convention
description: Express routes in routes/*.ts must NOT include /api/ prefix — the app already mounts at /api.
---

## Rule

Route files in `artifacts/api-server/src/routes/*.ts` must define paths **without** the `/api/` prefix.

**Correct:**
```ts
router.get("/anomalies/stats", authMiddleware, getStatsAnomalies);
router.get("/membres",         authMiddleware, listMembres);
```

**Wrong:**
```ts
router.get("/api/anomalies/stats", authMiddleware, getStatsAnomalies); // ❌
```

**Why:** `app.ts` does `app.use("/api", router)`, which strips the `/api` prefix before passing the request to the sub-router. If routes include `/api/`, the effective path becomes `/api/api/...` which never matches.

**How to apply:** Every time a new route file is created or a route returns 404 unexpectedly, check that the path in `router.get/post/put/delete()` starts without `/api/`.
