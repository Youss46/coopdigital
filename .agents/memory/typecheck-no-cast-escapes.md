---
name: Corrections de typecheck — jamais de cast d'échappement
description: Comment corriger les erreurs TS sans masquer de bugs réels (rejets de revue de code)
---

# Corrections de typecheck — jamais de cast d'échappement

**Règle :** pour faire passer `tsc`, ne jamais utiliser `as unknown as { ... }` ou un cast local pour accéder à un champ que le type ne connaît pas. Le champ manquant révèle presque toujours un vrai bug :
- champ absent du `select()` Drizzle → l'ajouter à la sélection (ex: un compte figé sur une livraison qui doit primer sur la config courante) ;
- champ inexistant dans la table → utiliser la vraie colonne (ex: `coutTotalFcfa` au lieu d'un `coutFcfa` imaginaire) ou calculer la valeur (ancienneté depuis `dateEmbauche`) ;
- champ absent du schéma Zod généré → étendre `lib/api-spec/openapi.yaml` puis relancer `pnpm exec orval --config orval.config.ts` dans `lib/api-spec` (régénère api-client-react ET api-zod), puis `pnpm run typecheck:libs`.

**Why:** la revue de complétion des tâches rejette systématiquement les casts qui masquent une divergence de schéma — trois rejets successifs sur une même tâche de correction de types en sont la preuve.

**How to apply:** avant tout cast, vérifier la vraie source (schéma Drizzle, select, OpenAPI). Corriger la source. Un cast n'est acceptable que pour des limites d'API externes (PDFKit internals, Express Request augmenté).

Aussi : si un commit parallèle (autre agent) introduit des centaines d'erreurs pendant la tâche, la revue l'attribue à la tâche courante — il faut soit le réparer proprement, soit l'annuler ligne à ligne si ses changements cassent le comportement production (ex: helper d'erreur qui neutralise la classification 404/409 par message en prod, ou renommage de clés de réponse `error`→`erreur`).
