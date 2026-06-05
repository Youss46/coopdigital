---
name: Orval format:date coerce
description: Orval generates zod.coerce.date() for OpenAPI format:date fields, producing JS Date objects — but Drizzle date columns expect strings.
---

## Rule

When an OpenAPI schema field has `format: date`, Orval generates `zod.coerce.date()`, so the parsed TypeScript type is `Date | undefined` (or `Date | null`), NOT `string`.

Drizzle `date("col_name")` columns expect `string | null | undefined`.

**How to apply:**

Add a `toDateStr` helper in any controller that handles date fields from OpenAPI-generated Zod bodies:

```typescript
function toDateStr(d: Date | null | undefined): string | null | undefined {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}
```

Then use it when mapping request body fields to Drizzle insert values:

```typescript
dateAgrement: toDateStr(d.date_agrement) ?? undefined,
```

**Why:** Orval assumes `format: date` values will be coerced to Date for validation. Drizzle uses ISO string literals for date columns. The mismatch causes TS2322 type errors at the controller level.
