---
name: Liaison coopérative des JWT terrain
description: Invariant d’authentification pour les comptes terrain et Peseurs
---

Un compte terrain ou Peseur sans coopérative rattachée ne doit jamais recevoir de JWT utilisable.

**Pourquoi:** les endpoints métier ont besoin du périmètre coopérative; laisser passer l’authentification puis refuser le premier appel produit une fausse déconnexion/session expirée côté client.

**Comment appliquer:** refuser la connexion avec une erreur explicite de rattachement et conserver le même garde-fou dans le middleware pour les anciens JWT déjà émis.