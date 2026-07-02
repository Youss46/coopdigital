---
name: Hero time-of-day dynamic theming
description: Pattern for varying a hero/login background gradient by time of day using inline styles, not Tailwind arbitrary classes.
---

When a component needs a gradient/color that changes based on a runtime value (e.g. time of day, computed period), don't build the Tailwind class name dynamically with template strings — Tailwind's scanner only picks up class strings that appear literally in source, so `bg-gradient-to-t from-[${dynamicColor}]` will not generate CSS.

**Why:** Tailwind v4 (and v3 JIT) statically scans source files for exact class-name strings; runtime-interpolated arbitrary values are invisible to the scanner and silently produce no styles.

**How to apply:** Define a lookup table (e.g. `Record<Periode, {...}>`) of plain CSS values (hex colors, `linear-gradient(...)` strings) keyed by the runtime state, and apply them via inline `style={{ backgroundColor, backgroundImage }}` instead of Tailwind classes. Keep Tailwind classes only for the static parts of the layout.
