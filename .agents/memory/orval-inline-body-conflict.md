---
name: Orval inline body naming conflict
description: Inline request-body schemas in OpenAPI cause naming conflicts in Orval codegen between types/ and api.ts
---

## Rule
Never use inline schemas for request bodies in the OpenAPI spec. Always use `$ref` pointing to a named schema in `#/components/schemas/`.

**Why:** When a request body is inline (anonymous), Orval names it `{OperationId}Body` and generates it in BOTH:
1. `lib/api-zod/src/generated/api.ts` — as a Zod `const FooBody = zod.object({...})`
2. `lib/api-zod/src/generated/types/{fooBody}.ts` — as a TypeScript `type FooBody = {...}`

When re-exported from `lib/api-zod/src/index.ts`, both exports clash.

**How to apply:** If you add an endpoint with a small inline request body (e.g., just `dateFermeture`), add a named schema `FooInput` to `#/components/schemas/` and reference it with `$ref: "#/components/schemas/FooInput"` in the requestBody.
