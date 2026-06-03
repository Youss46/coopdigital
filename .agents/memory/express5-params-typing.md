---
name: Express 5 req.params typing
description: In this project, req.params[key] resolves to string | string[] instead of the expected string, requiring explicit String() casts.
---

In this workspace, `req.params["key"]!` produces a TypeScript error:
> Argument of type 'string | string[]' is not assignable to parameter of type 'string'.

**Why:** The version of `@types/express` in use types `req.params` such that individual values can be `string | string[]` instead of plain `string`.

**How to apply:** Wrap every `req.params` access with `String()`:
```typescript
// ❌ Breaks
const id = parseInt(req.params["id"]!);
const token = req.params["token"]!;

// ✅ Works
const id = parseInt(String(req.params["id"] ?? "0"));
const token = String(req.params["token"] ?? "");
```

Same applies in `req.query` (use `String(req.query["key"] ?? "")` instead of direct access).
