---
name: Authenticated terrain cache isolation
description: Rule for caching terrain data on shared mobile devices.
---

Les réponses API terrain contenant un en-tête `Authorization` ne doivent jamais être mises en cache par le service worker ou le cache HTTP. Les listes de sessions doivent également être revalidées par rapport à la coopérative et au peseur connectés.

**Why:** Un même téléphone peut servir à plusieurs comptes. Un cache indexé sur l’URL, plutôt que sur l’identité, peut afficher à un utilisateur les données du compte précédent.

**How to apply:** Pour toute nouvelle lecture terrain authentifiée, utiliser une réponse `Cache-Control: private, no-store` quand elle contient des données de compte et refuser côté client une réponse hors du périmètre d’identité courant.