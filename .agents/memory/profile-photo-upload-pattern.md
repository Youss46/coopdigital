---
name: Profile photo upload pattern (avatar)
description: How base64 avatar photo upload was added for `users` (as opposed to the existing `membres` photo pattern)
---

`users` table did not have a photo column; `membres` already had one via `portailController.savePhotoHandler`. When adding an analogous feature for a different entity/table, follow the same shape but keep it separate:

- Add a nullable `photo_url text` column via a normal Drizzle migration + `_journal.json` entry (see `drizzle-journal-required.md`).
- Backend endpoint accepts `{ photoDataUrl: string | null }`; `null` explicitly means "remove photo" (distinct from omitted/invalid). Validate `data:image/` prefix and a max byte length (~350-500KB) for non-null values.
- Client-side compression (canvas resize to ~400px + JPEG quality fallback loop 0.90→0.60, PNG kept only if small) is a **reusable pattern** already implemented in `ParametresPage.tsx` for logos — duplicate/adapt rather than trying to share a hook across unrelated pages.
- `AuthResponse`/login payload should embed the photo URL so it's available immediately without an extra fetch after login; add a small `updateXxxUrl` setter in `AuthContext` that patches both React state and the localStorage-cached user object.
- The `components/ui/avatar.tsx` (Radix Avatar) was already present but unused — check for existing unused UI primitives before adding new ones.

**Why:** avoids re-deriving the compression/validation approach from scratch and keeps DB null-semantics unambiguous between the various photo-bearing tables (`membres`, `users`, etc).
