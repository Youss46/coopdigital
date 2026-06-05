---
name: Object storage signed_url cast
description: objectStorage.ts template uses response.json() which returns unknown — must cast for signed_url property access.
---

## Rule

In `artifacts/api-server/src/lib/objectStorage.ts`, the call to `response.json()` returns `unknown`. TypeScript 5.x strict mode then rejects property access on `unknown`.

**Fix:**

```typescript
const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
```

**Why:** The template was written before strict `noImplicitAny` / `unknown` inference on `response.json()`. Any time the template is copied fresh, this cast must be applied.
