---
name: Terrain Peseur Role
description: Pattern d'ajout d'un nouveau rôle terrain (peseur) — quels fichiers toucher et les invariants à respecter.
---

# Rôle Peseur — pattern ajout d'un rôle terrain

## Règle
Ajouter un rôle terrain nécessite de toucher **exactement** ces fichiers dans l'ordre :

1. `artifacts/api-server/src/middlewares/terrainAuth.ts` — type `TerrainJwtPayload.role` + check dans le middleware
2. `artifacts/api-server/src/services/terrainService.ts` — condition `loginTerrain` (ligne `user.role !== "delegue" && …`)
3. `artifacts/terrain/src/App.tsx` — import de la page accueil, composant de routes, branch dans `AppRoutes`
4. Créer `artifacts/terrain/src/pages/AccueilXxx.tsx` — page d'accueil spécifique au rôle
5. Créer `artifacts/terrain/src/components/BottomNavXxx.tsx` — barre de navigation avec les seules pages autorisées
6. `artifacts/frontend/src/pages/ComptesPage.tsx` — 6 endroits : `UserRole` type, `ROLE_LABELS`, `ROLE_BADGE_STYLE`, `getRolesCreables`, conditions `isTerrainUser` (WhatsApp + ResetModal), champ section/zone

**Why:** Les rôles terrain sont des lignes dans `users` (varchar role, pas d'enum), auth par téléphone via `terrainAuthMiddleware`. L'oubli d'un seul endroit provoque soit un 403 à la connexion, soit un affichage incorrect dans l'admin.

**How to apply:**
- `peseur` = rôle terrain collecte-only ; pas de paiement, avance, commissions, missions
- `delegueOnly` middleware sur les routes avance/paiement protège déjà le backend — pas besoin de guard supplémentaire
- Le peseur partage `CollecteFlow` et `SyncHistorique` avec le délégué, mais a son propre accueil et nav
- Connexion par téléphone (comme `agent_terrain`), donc `isTerrainUser = role === "agent_terrain" || role === "peseur"` dans ComptesPage
