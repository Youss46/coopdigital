---
name: api-zod barrel export conflict
description: lib/api-zod/src/index.ts must only re-export from generated/api; adding export type * from generated/types causes TS2308 in TS 5.9 when Zod param schemas share names with TypeScript param types.
---

## Rule

`lib/api-zod/src/index.ts` must contain ONLY:
```ts
export * from "./generated/api";
```

Do NOT add `export type * from "./generated/types"` even though it seems safe.

## Why

Orval v8.9.1 generates, for routes with query params, BOTH:
1. A Zod schema constant in `generated/api.ts` — `export const GetXxxParams = zod.object({...})`
2. A TypeScript type in `generated/types/getXxxParams.ts` — `export type GetXxxParams = {...}`

In TypeScript 5.9, even `export type *` causes **TS2308** (ambiguous member) when the same name is already a value-export in `export *` from the same barrel.

The previous guidance (use `export type *`) was based on TS < 5.9 behavior. With TS 5.9, removing the `export type *` line entirely is the correct fix.

**How to apply:** After any codegen run, if typecheck fails with "Module './generated/api' has already exported a member named 'GetXxxParams'", ensure `lib/api-zod/src/index.ts` has only the single `export * from "./generated/api"` line.
