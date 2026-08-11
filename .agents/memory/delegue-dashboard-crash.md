---
name: Délégué dashboard white-screen crash
description: Root causes and fixes for the white page that appears when a délégué logs in.
---

## Root causes

1. **`peseursData?.stats.nbPeseurs`** (DashboardDelegue.tsx) — optional chain only on `peseursData`, not on `.stats`. If the API returns an error object `{ erreur: "..." }`, `peseursData.peseurs.length` crashes first, but if the object has `peseurs` but no `stats`, line 503 crashes silently. Fixed with `peseursData?.stats?.nbPeseurs`.

2. **`apiFetch` swallows non-2xx responses** — the fetch helper did `.then(r => r.json())` without checking `r.ok`. Error responses (402 tenant guard, 403, 500) resolve as `{ erreur: "..." }` instead of throwing, so React Query stores the error shape as `data` and the component crashes trying to access typed fields. Fixed with `if (!r.ok) throw new Error(...)`.

3. **No ErrorBoundary** — any uncaught render error caused the entire React tree to unmount → blank white page with no feedback. Fixed by adding `<ErrorBoundary>` wrapping `<AppRoutes />` in App.tsx.

4. **`AuthContext` JSON.parse** — `JSON.parse(localStorage.getItem(USER_KEY))` had no try/catch. Malformed localStorage data crashes the context provider before the app even renders. Fixed with try/catch that clears the bad entry.

## Related: peseurs-collectes endpoint fix

After changing `livraisons.agentId = delegueId` for peseur-attached livraisons, `GET /dashboard/peseurs-collectes` was still filtering by `agentId IN peseurIds`. Updated to filter by `peseurId IN peseurIds OR agentId IN peseurIds` for backwards compat.

**Why:** Peseur livraisons now store the délégué's ID as `agentId` and the peseur's own ID in `peseurId`. Both must be checked to support old and new data.

## How to apply

- Any new `apiFetch` helper in frontend pages must check `r.ok` before calling `r.json()`.
- Any new page that uses `useQuery` with a typed response must guard against unexpected API response shapes (use optional chaining + nullish coalescing throughout).
- All route-level components should be wrapped in an ErrorBoundary to avoid white screens.
