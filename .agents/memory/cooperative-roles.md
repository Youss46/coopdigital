---
name: Cooperative role configuration
description: Règles durables pour l’activation, le blocage et la gouvernance des rôles par coopérative.
---

Chaque rôle est configurable par coopérative avec les états `active` ou `disabled`; l’absence de ligne signifie actif par défaut. La désactivation est contrôlée à la connexion et sur les requêtes authentifiées, avec le code `ROLE_DISABLED`, sans supprimer les comptes ni leur historique. La création d’un compte avec un rôle désactivé est refusée. La configuration ne peut pas désactiver le dernier PCA ou Directeur actif disponible.

**Why:** Les rôles sont une capacité tenant-scoped, et les tokens déjà délivrés ne doivent pas conserver un accès après une désactivation.

**How to apply:** Conserver l’ordre licence → fonctionnalité → rôle coopératif → permission RBAC; les parcours terrain doivent appliquer la même règle que les parcours web.