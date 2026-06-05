---
name: Orval inline requestBody naming conflict
description: When a POST endpoint uses an inline requestBody schema, Orval generates a body type (e.g. PostSubventionsIdRapportBody) that conflicts with the same name in generated/types, causing TS2308. Fix by using a $ref to a named schema instead.
---

## Rule
Never use inline `schema: { type: object, properties: {...} }` for POST/PUT requestBody in openapi.yaml if the generated body type name could conflict. Always use `$ref: "#/components/schemas/NamedInput"` and define a named schema.

**Why:** Orval generates the body type name from the operation path (e.g. `POST /subventions/{id}/rapport` → `PostSubventionsIdRapportBody`). It emits this type in both `generated/api.ts` (as a zod schema) and `generated/types/postSubventionsIdRapportBody.ts`. The `src/index.ts` barrel re-exports both, causing TS2308 "already exported a member".

**How to apply:** When adding a new POST/PUT endpoint to openapi.yaml, always write:
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        $ref: "#/components/schemas/MyOperationInput"
```
And add `MyOperationInput` to the components/schemas section.
