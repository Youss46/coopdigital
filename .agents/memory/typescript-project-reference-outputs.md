---
name: TypeScript project-reference outputs
description: Frontend checks can consume stale or missing declarations from referenced workspace libraries instead of current source contracts.
---

When a frontend package imports a workspace library whose package export points to source, avoid adding a TypeScript project reference solely for type availability; project references make the check depend on that library's generated declaration output.

**Why:** Ignored declaration output can be stale after an API contract/codegen change or absent in a clean checkout, producing misleading errors and hiding the real source types.

**How to apply:** Prefer source resolution for artifact-local checks, or make the validation explicitly build referenced libraries first. Test the check with generated output removed when the goal is standalone frontend validation.