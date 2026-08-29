---
name: Fixtures PostgreSQL typées
description: Contrainte d’inférence des types de paramètres dans les fixtures SQL d’intégration.
---

Dans une fixture PostgreSQL, ne pas réutiliser un même paramètre dans des colonnes dont les types SQL diffèrent; utiliser des paramètres distincts et des casts explicites (`integer`, `numeric`) lorsque nécessaire.

**Why:** le pilote PostgreSQL prépare la requête et peut rejeter un paramètre réutilisé avec « inconsistent types deduced for parameter » avant même l’exécution du test.

**How to apply:** pour les INSERT bruts des tests d’intégration, vérifier les types réels du schéma et caster les paramètres au point d’usage plutôt que de compter sur l’inférence du pilote.

Les colonnes `date` lues par le client `pg` brut peuvent revenir comme des objets `Date`; caster `date_colonne::text` dans les requêtes d’assertion si le test compare une date ISO courte.

**Why:** les mêmes dates sont représentées en chaîne par Drizzle avec `mode: "string"`, mais le client `pg` utilisé dans les fixtures applique son propre parseur de types.

**How to apply:** choisir explicitement le contrat d’assertion (`::text` ou objet `Date`) et insérer les lignes soumises à un trigger de contrainte différé dans une seule requête ou transaction.