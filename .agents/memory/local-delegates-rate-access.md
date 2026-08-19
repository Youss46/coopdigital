---
name: Accès aux taux des délégués de localités
description: Règle d’autorisation et de portée pour la configuration des commissions des membres délégués de localités.
---

# Accès aux taux des délégués de localités

Les taux de commission des délégués, terrain comme localités, ne dépendent pas de la permission `delegues`. Ils utilisent la permission dédiée `commissions_delegues` : PCA, directeur, comptable et auditeur peuvent les consulter ; seuls PCA, directeur et comptable peuvent les créer, modifier ou supprimer.

**Why:** les taux ont un effet direct sur les paiements futurs. Ils doivent rester accessibles aux rôles financiers légitimes sans ouvrir leur modification à tous les comptes coopératifs authentifiés. L'auditeur garde une visibilité indépendante en lecture seule.

**How to apply:** protégez les listes avec `commissions_delegues.lire` et les mutations avec `commissions_delegues.gerer_taux`. Masquez aussi les boutons de modification aux rôles non autorisés ; la sécurité reste toujours imposée par les routes API.