---
name: Cache HTTP et CORS Railway
description: Contrainte CORS pour les appels frontend Vercel vers l'API Railway.
---

Pour empêcher une réponse périmée, utiliser `cache: "no-store"` dans `fetch` côté navigateur et envoyer `Cache-Control: no-store` dans la réponse API. Ne pas ajouter `Cache-Control` comme en-tête de requête lorsqu'un frontend appelle directement l'API Railway depuis Vercel.

**Why:** `Cache-Control` n'est pas un en-tête CORS safelisté. Dans ce contexte, il déclenche un preflight supplémentaire qui peut échouer et être affiché comme une liste vide si l'état d'erreur frontend est absorbé.

**How to apply:** conserver les en-têtes de requête limités à `Authorization` et aux en-têtes safelistés; distinguer toujours l'état d'erreur API de l'état « aucune donnée » dans le journal.