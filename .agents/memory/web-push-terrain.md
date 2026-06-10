---
name: Web Push notifications terrain
description: Architecture des notifications push pour l'app terrain — VAPID, subscription, envoi depuis l'API
---

## Règle
Le Service Worker terrain (public/sw.js) lit `{ titre, message, url }` dans les payloads push — PAS `{ title, body }`. Toujours utiliser `titre`/`message` dans `envoyerPushNotification`.

**Why:** Le SW existait avant la feature push avec ses propres clés — uniformité avec le reste du code FR.

## Comment appliquer
- Pour envoyer un push : `envoyerPushNotification(userId, { title, body, url })` — le service interne fait la conversion vers `{ titre, message, url }` avant d'envoyer.
- VAPID keys dans env vars shared : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Push fonctionne uniquement en PROD (le hook usePushSubscription vérifie `import.meta.env.PROD`).
- Table `push_subscriptions` : userId + endpoint UNIQUE — un appareil par paire.
- Subscriptions expirées (HTTP 410/404) sont auto-supprimées lors de l'envoi.
