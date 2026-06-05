---
name: api-zod export type star
description: lib/api-zod/src/index.ts must use export type * for the types/ directory to avoid value/type conflicts
---

## Rule
`lib/api-zod/src/index.ts` must be:
```typescript
export * from "./generated/api";
export type * from "./generated/types";
```

**Why:** `./generated/api` exports Zod schemas as values (const). `./generated/types` re-exports TypeScript types. If both use `export *`, TypeScript sees duplicate exports for any name that appears in both (e.g. request body types). Using `export type *` for the types directory makes the re-export type-only, resolving the ambiguity.

**How to apply:** After any codegen that adds new schemas, if typecheck fails with "Module './generated/api' has already exported a member named 'X'", check that the index.ts still uses `export type *` (codegen regenerates api.ts and types/ but NOT index.ts).
