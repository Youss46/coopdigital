# CoopDigital

Plateforme web de gestion pour coopératives cacaoyères en Côte d'Ivoire.

## Modules MVP

- **M01 – Membres** : inscription, fiche complète, QR code, historique
- **M04 – Avances & Paiements** : octroi d'avances, livraisons, déductions automatiques, paiements mobile money

## Prérequis

- Node.js 24+
- pnpm 9+
- PostgreSQL 15+

## Installation

```bash
# Cloner le projet et installer les dépendances
pnpm install

# Configurer les variables d'environnement du backend
cp artifacts/api-server/.env.example artifacts/api-server/.env
# Éditer .env avec vos valeurs réelles
```

## Variables d'environnement

Fichier : `artifacts/api-server/.env`

| Variable       | Description                          | Exemple                                      |
|----------------|--------------------------------------|----------------------------------------------|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL       | `postgresql://user:pass@localhost:5432/coop` |
| `JWT_SECRET`   | Clé secrète pour les tokens JWT      | `une_chaine_aleatoire_longue`                |
| `PORT`         | Port d'écoute du serveur API         | `8080`                                       |

## Structure du projet

```
.
├── artifacts/
│   ├── api-server/          # Backend Node.js + Express
│   │   ├── db/
│   │   │   └── migrations/  # Scripts SQL de migration
│   │   ├── src/
│   │   │   ├── routes/      # Routes API
│   │   │   ├── middlewares/ # Middleware (auth JWT, etc.)
│   │   │   └── controllers/ # Logique métier
│   │   └── .env.example
│   └── frontend/            # Frontend React + Vite + Tailwind
│       └── src/
│           ├── pages/       # Pages de l'application
│           ├── components/  # Composants réutilisables
│           ├── contexts/    # Contextes React (Auth, etc.)
│           └── services/    # Appels API (axios)
├── lib/
│   ├── api-spec/            # Spécification OpenAPI (source de vérité)
│   ├── api-client-react/    # Hooks React Query générés
│   ├── api-zod/             # Schémas Zod générés
│   └── db/                  # Schéma Drizzle ORM
└── README.md
```

## Démarrage

```bash
# Démarrer le backend (port 8080, accessible via /api)
pnpm --filter @workspace/api-server run dev

# Démarrer le frontend (port assigné automatiquement, accessible via /)
pnpm --filter @workspace/frontend run dev
```

## Commandes utiles

```bash
# Vérification des types (tout le workspace)
pnpm run typecheck

# Régénérer les hooks API et schémas Zod depuis la spec OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Appliquer les migrations de schéma DB (développement uniquement)
pnpm --filter @workspace/db run push
```

## Stack technique

| Couche     | Technologie                              |
|------------|------------------------------------------|
| Frontend   | React 19, Vite, Tailwind CSS v4          |
| Backend    | Node.js 24, Express 5                    |
| Base de données | PostgreSQL + Drizzle ORM            |
| Validation | Zod v4, drizzle-zod                      |
| Auth       | JWT (jsonwebtoken) + bcrypt              |
| Devise     | FCFA (Franc CFA)                         |
| Langue     | Français                                 |

## Conventions

- Tous les montants financiers sont en **FCFA** (entiers, pas de décimales)
- Les champs financiers respectent les conventions **OHADA**
- L'interface et les messages d'erreur sont en **français**
