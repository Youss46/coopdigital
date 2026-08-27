---
name: Fixtures PostgreSQL typées
description: Contrainte d’inférence des types de paramètres dans les fixtures SQL d’intégration.
---

Dans une fixture PostgreSQL, ne pas réutiliser un même paramètre dans des colonnes dont les types SQL diffèrent; utiliser des paramètres distincts et des casts explicites (`integer`, `numeric`) lorsque nécessaire.

**Why:** le pilote PostgreSQL prépare la requête et peut rejeter un paramètre réutilisé avec « inconsistent types deduced for parameter » avant même l’exécution du test.

**How to apply:** pour les INSERT bruts des tests d’intégration, vérifier les types réels du schéma et caster les paramètres au point d’usage plutôt que de compter sur l’inférence du pilote.