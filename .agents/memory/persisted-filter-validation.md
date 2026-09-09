---
name: Filtres persistés validés
description: Règle pour restaurer des filtres d’interface qui pilotent des requêtes API.
---

Les filtres restaurés depuis le stockage local doivent être validés avant de déclencher une requête, tout en conservant une valeur invalide visible afin que l’interface puisse expliquer l’erreur.

**Why:** une valeur persistée peut être corrompue ou représenter une période inversée; envoyer cette valeur au serveur produit des résultats trompeurs. Les tests qui utilisent des dates relatives à l’horloge du runner deviennent aussi instables.

**How to apply:** valider le format et les valeurs calendaires à la restauration, laisser le composant appliquer sa validation métier avant le chargement, et initialiser les tests avec des dates ISO fixes.