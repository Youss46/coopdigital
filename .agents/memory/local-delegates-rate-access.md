---
name: Accès aux taux des délégués de localités
description: Règle d’autorisation et de portée pour la configuration des commissions des membres délégués de localités.
---

# Accès aux taux des délégués de localités

Les taux de commission des délégués, terrain comme localités, ne dépendent pas de la permission `delegues`. Ils utilisent la permission dédiée `commissions_delegues` : PCA, directeur, comptable et auditeur peuvent les consulter ; seuls PCA, directeur et comptable peuvent les créer, modifier ou supprimer.

Le rôle comptable accède à toute la page des délégués de localités et à ses opérations financières : consultation, avances, remboursements, commissions et taux. Il ne peut pas créer un membre délégué de localités, car `membres.creer` reste exclu de son rôle.

**Why:** les taux et opérations de cette page ont un effet direct sur les paiements futurs et relèvent du suivi financier du comptable. La création de l’identité d’un délégué reste une responsabilité organisationnelle distincte. L'auditeur garde une visibilité indépendante en lecture seule.

**How to apply:** ne pas placer `/delegues-localites` dans les modules interdits au comptable. Protéger les opérations par leurs permissions financières et conserver la création via `membres.creer`. Masquer les actions opérationnelles étrangères au rôle.