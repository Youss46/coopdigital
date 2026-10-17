---
name: Installation pnpm derrière le firewall
description: Éviter qu’un paquet annexe bloqué par le registre Replit empêche de vérifier un artefact ciblé d’un monorepo pnpm.
---

Dans ce monorepo, le registre Replit peut refuser une archive de dépendance verrouillée lors d’un `pnpm install` complet, alors que les dépendances nécessaires à l’application ciblée s’installent avec des filtres pnpm. Relever d’abord la dépendance bloquée à une version disponible plus récente conformément aux règles du package management, puis installer uniquement l’application et ses dépendances workspace nécessaires pour les vérifications.

**Why:** l’installation complète peut échouer sur des paquets d’outillage sans lien avec les fichiers modifiés; une installation filtrée a permis de construire et tester le frontend et l’API ciblés.

**How to apply:** lors d’un 403 du firewall, ne pas contourner le registre. Vérifier une version plus récente du paquet bloqué puis utiliser `pnpm install --filter '<app>...'` pour limiter l’installation au graphe requis.
