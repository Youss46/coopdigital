# CoopDigital

Plateforme de gestion des coopératives cacaoyères en Côte d'Ivoire (langue française). Couvre la gestion des membres (M01) et des avances & paiements (M04).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/frontend run dev` — run the frontend Vite dev server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` (Postgres), `JWT_SECRET` (for token signing — set via Replit Secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 (artifact at `/`)
- API: Express 5 (artifact at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → React Query hooks + Zod schemas
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — source of truth for all DB schemas (Drizzle)
- `lib/api-spec/openapi.yaml` — source of truth for API contract (OpenAPI 3.1)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `artifacts/api-server/src/` — Express routes, controllers, middlewares
- `artifacts/frontend/src/` — React pages and components
- `artifacts/api-server/db/seed.sql` — données de test (5 membres, 3 avances, 4 livraisons)

## Architecture decisions

- **Contract-first API**: OpenAPI spec → codegen → typed hooks + validation. Any API change starts in `openapi.yaml`, then run codegen.
- **JWT auth**: Token signé avec `JWT_SECRET` (8h expiry). Frontend stocke le token dans `localStorage`, injecté via `setAuthTokenGetter` dans le `customFetch` de l'API client.
- **Déduction automatique des avances**: Lors d'une livraison, l'avance en cours du membre est automatiquement déduite du montant brut dans une transaction SQL atomique.
- **Pas de `console.log` côté serveur**: Utiliser `req.log` dans les handlers et le singleton `logger` ailleurs (Pino).
- **FCFA** : toutes les valeurs monétaires sont des entiers (centimes non utilisés).

## Product

- **Connexion** : Login avec email + mot de passe, JWT 8h
- **Dashboard** : KPIs (membres actifs, avances en cours, tonnage du mois, paiements), dernières livraisons, avances en retard
- **Membres** : Liste paginée avec recherche/filtre, création de membre, fiche détaillée avec QR code et historique livraisons/avances
- **Avances** : Liste, création, remboursement manuel, résumé encours
- **Livraisons** : Saisie pesée avec déduction automatique d'avance et calcul du net en temps réel

## User preferences

_Ajouter ici les préférences explicites de l'utilisateur._

## Gotchas

- Le `codegen` doit être re-exécuté après chaque modification de `openapi.yaml`
- `montantRembourse_fcfa` dans le schéma Drizzle utilise un underscore interne (colonne `montant_rembourse_fcfa`) — préférer l'import direct depuis `@workspace/db`
- Le frontend utilise **wouter** (pas react-router-dom) pour le routing
- `UseQueryOptions` dans React Query v5 exige `queryKey` — utiliser les helpers `getGet*QueryKey()` générés par Orval quand on passe des options `enabled`
- Seed admin : `admin@coopdigital.ci` / `Admin1234!`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
