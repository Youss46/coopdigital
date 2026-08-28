---
name: Authenticated API cache isolation
description: Rule for caching authenticated data across the CoopDigital frontends.
---

Les réponses API contenant un en-tête `Authorization` ne doivent jamais être mises en cache par le service worker ou le cache HTTP. Les listes de sessions doivent également être revalidées par rapport à la coopérative et au peseur connectés.

**Why:** Un même téléphone peut servir à plusieurs comptes, et une réponse vide peut être mémorisée avant qu’une donnée soit créée. Un cache indexé sur l’URL, plutôt que sur l’identité, peut afficher une donnée obsolète ou appartenant au compte précédent.

**How to apply:** Pour toute nouvelle lecture authentifiée, utiliser une réponse `Cache-Control: private, no-store` quand elle contient des données de compte et une stratégie service worker `NetworkOnly`; refuser côté client une réponse hors du périmètre d’identité courant.

**Piège SW** : le matching de chemins du service worker doit couvrir TOUS les préfixes API (`/api/`), pas seulement `/api/terrain`. Tout endpoint API hors du préfixe couvert tombe dans la stratégie cache-first des assets statiques → données figées au premier chargement (bug « session en cours » persistant après annulation, visible uniquement en prod car SW enregistré prod-only). Bump du CACHE_VERSION obligatoire pour purger les caches empoisonnés déjà installés.