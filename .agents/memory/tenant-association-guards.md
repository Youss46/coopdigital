---
name: Contrôles des associations multi-tenant
description: Règle de sécurité pour rattacher deux ressources appartenant à une coopérative.
---

Toute opération qui associe deux ressources tenant-scoped doit vérifier l’appartenance du parent et de l’enfant à la même coopérative dans une transaction avant l’insertion.

**Why:** vérifier seulement l’enfant laisse une requête directe rattacher une ressource valide à un parent d’un autre tenant.

**How to apply:** verrouiller et relire les deux ressources avec le `cooperativeId` de l’utilisateur, refuser dès qu’une ressource manque, puis effectuer l’insertion dans cette même transaction.