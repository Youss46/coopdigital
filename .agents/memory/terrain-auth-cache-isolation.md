---
name: Authenticated terrain cache isolation
description: Rule for caching terrain data on shared mobile devices.
---

Les réponses API terrain contenant un en-tête `Authorization` ne doivent jamais être mises en cache par le service worker ou le cache HTTP. Les listes de sessions doivent également être revalidées par rapport à la coopérative et au peseur connectés.

**Why:** Un même téléphone peut servir à plusieurs comptes. Un cache indexé sur l’URL, plutôt que sur l’identité, peut afficher à un utilisateur les données du compte précédent.

**How to apply:** Pour toute nouvelle lecture terrain authentifiée, utiliser une réponse `Cache-Control: private, no-store` quand elle contient des données de compte et refuser côté client une réponse hors du périmètre d’identité courant.

**Piège SW** : le matching de chemins du service worker doit couvrir TOUS les préfixes API (`/api/`), pas seulement `/api/terrain`. Tout endpoint API hors du préfixe couvert tombe dans la stratégie cache-first des assets statiques → données figées au premier chargement (bug « session en cours » persistant après annulation, visible uniquement en prod car SW enregistré prod-only). Bump du CACHE_VERSION obligatoire pour purger les caches empoisonnés déjà installés.