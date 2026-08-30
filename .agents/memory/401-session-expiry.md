---
name: 401 session expiry — global handler pattern
description: How each frontend app handles JWT expiry (401) to avoid silent empty dashboard instead of redirecting to login.
---

# 401 Session Expiry Handling

## The rule
When a JWT expires, the server returns 401. Every frontend must detect this and redirect to login rather than silently showing empty data.

## How to apply

### Main frontend (`artifacts/frontend`)
- `lib/api-client-react/src/custom-fetch.ts` exports `setOnUnauthorized(callback)`.
- On any 401 response, `_onUnauthorized()` is called before throwing `ApiError`.
- `artifacts/frontend/src/contexts/AuthContext.tsx` registers the handler at module level:
  ```ts
  setOnUnauthorized(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = `${base}/login`;
  });
  ```
- `setOnUnauthorized` must be exported from `lib/api-client-react/src/index.ts`.

### Terrain app (`artifacts/terrain`)
- `apiFetch` in `artifacts/terrain/src/lib/api.ts` checks `res.status === 401` explicitly, calls `clearAuth()`, stores the server reason, and redirects to `.../login`.
- The startup cleanup in `getStoredActiveAuth()` must remove only session keys; calling `clearAuth()` there erases the pending error message before the login screen can render it.

### Portail app (`artifacts/portail`)
- `req` in `artifacts/portail/src/lib/api.ts` checks `res.status === 401` explicitly, calls `clearToken()` and `window.location.href = .../connexion`.

### M15 app (`artifacts/m15`)
- Already had a 401 handler in `artifacts/m15/src/lib/api.ts` — no change needed.

**Why:** The QueryClient was created outside AuthProvider so TanStack Query onError can't access logout(). Module-level registration in AuthContext.tsx (same file as setAuthTokenGetter) avoids needing React context.
