# CoopDigital

Plateforme SaaS multi-tenants de gestion pour coopératives cacaoyères en Côte d'Ivoire.

## Architecture

| Couche | Technologie | Déploiement |
|--------|-------------|-------------|
| Frontend principal | React 19 + Vite + Tailwind CSS v4 | Vercel |
| Portail membre | React + Vite | Vercel |
| Dashboard M15 | React + Vite | Vercel |
| Agent terrain | React + Vite (PWA) | Vercel |
| Backend API | Node.js 24 + Express 5 | Railway |
| Base de données | PostgreSQL + Drizzle ORM | Railway |

Replit est utilisé comme **environnement de développement**. Le déploiement se fait via GitHub → Railway (API) / Vercel (frontends).

## Structure du monorepo (pnpm workspaces)

```
artifacts/
  api-server/     # Backend Express — port 8080
  frontend/       # Frontend principal
  m15/            # Dashboard M15 Tech
  portail/        # Portail membre
  terrain/        # App agent terrain (PWA)
  mockup-sandbox/ # Sandbox de design
lib/
  db/             # Schéma Drizzle ORM + migrations
  api-spec/       # Spec OpenAPI (source de vérité)
  api-client-react/ # Hooks React Query générés (Orval)
  api-zod/        # Schémas Zod générés (Orval)
```

## Démarrage en développement

Les workflows Replit démarrent automatiquement les services. Pour les relancer manuellement :

```bash
# Backend API (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend principal
pnpm --filter @workspace/frontend run dev

# Portail membre
pnpm --filter @workspace/portail run dev

# Dashboard M15
pnpm --filter @workspace/m15 run dev

# Agent terrain
pnpm --filter @workspace/terrain run dev
```

## Variables d'environnement (Replit dev)

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Injectée automatiquement par Replit | PostgreSQL Replit intégré |
| `JWT_SECRET` | Secret Replit | Valeur dev distincte de la prod |
| `VAPID_PUBLIC_KEY` | Env var partagée | Web Push notifications |
| `VAPID_PRIVATE_KEY` | Env var partagée | Web Push notifications |
| `VAPID_SUBJECT` | Env var partagée | Web Push notifications |
| `ALLOWED_ORIGINS` | Env var partagée | Vide = toutes origines autorisées (dev) |

## Base de données

- **Développement** : PostgreSQL intégré Replit (DATABASE_URL auto-injectée)
- **Production** : PostgreSQL Railway
- Les migrations sont appliquées automatiquement au démarrage du serveur API (`runMigrations`)
- Pour régénérer le schéma manuellement : `pnpm --filter @workspace/db run push` ⚠️ peut échouer sur Replit (voir note ci-dessous)

> **Note** : `drizzle-kit push` peut échouer sur la DB Replit avec "type serial does not exist". Contourner en exécutant le SQL CREATE TABLE directement ou en laissant le serveur appliquer les migrations au démarrage.

## Commandes utiles

```bash
# Vérification des types (tout le workspace)
pnpm run typecheck

# Régénérer hooks API et schémas Zod depuis la spec OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Lancer les tests
pnpm -r --if-present run test
```

## User preferences

- Langue : Français (interface et messages d'erreur)
- Montants financiers en FCFA (entiers, pas de décimales)
- Conventions comptables OHADA
- Déploiement via GitHub (pas via Replit Deploy)
