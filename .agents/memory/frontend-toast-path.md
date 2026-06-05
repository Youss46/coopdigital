---
name: Frontend toast hook path
description: The useToast hook lives at @/hooks/use-toast, not @/components/ui/use-toast.
---

## Rule

Import the toast hook from:

```typescript
import { useToast } from "@/hooks/use-toast";
```

**NOT** from `@/components/ui/use-toast` — that path does not exist in this project.

**Why:** The ui/ directory only contains Radix/shadcn component files (toast.tsx, toaster.tsx). The hook lives in the hooks/ directory alongside other custom hooks.
