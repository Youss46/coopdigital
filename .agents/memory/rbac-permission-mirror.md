---
name: RBAC permission mirror
description: The frontend keeps a client-side copy of the backend permission matrix for hiding UI actions.
---

Toute nouvelle permission d’action doit être ajoutée à la matrice backend et à sa copie frontend.

**Why:** le backend peut autoriser l’opération alors que l’interface masque silencieusement le bouton si la copie frontend n’est pas synchronisée.

**How to apply:** lors de l’ajout ou de la modification d’une permission, comparer les deux matrices et vérifier le parcours UI du rôle concerné.