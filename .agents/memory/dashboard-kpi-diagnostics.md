---
name: Diagnostic des KPI du tableau de bord
description: Les métriques dégradées doivent exposer la cause technique exploitable plutôt qu’un simple nom de métrique.
---

Lorsqu’un KPI échoue, l’interface doit afficher la cause réelle de l’erreur côté serveur, avec les informations sensibles masquées. Les agrégats SQL doivent qualifier explicitement les colonnes partagées entre les tables jointes.

**Why:** Une carte Paiements restait à zéro avec le seul libellé « paiements »; le détail PostgreSQL a révélé une colonne `montant_fcfa` ambiguë et permis de corriger la requête.

**How to apply:** Conserver `degradedMetrics` pour l’état fonctionnel et ajouter un message diagnostique associé; qualifier les sommes et moyennes avec leur table source dans toute requête multi-jointures.