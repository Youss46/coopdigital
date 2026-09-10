---
name: Enum PostgreSQL dans les migrations Drizzle
description: Évite l’échec « unsafe use of new value » lorsque le migrateur groupe plusieurs migrations dans une transaction.
---

Quand une migration ajoute une valeur à un enum PostgreSQL et qu’une migration suivante du même lancement crée une contrainte qui la référence, la contrainte doit comparer la colonne après conversion en texte, par exemple `statut::text`.

**Why:** Le migrateur Drizzle exécute toutes les migrations en attente dans une même transaction. PostgreSQL refuse d’utiliser directement une nouvelle valeur d’enum avant la validation de cette transaction, même si l’ajout et la contrainte sont dans deux fichiers successifs.

**How to apply:** Dans les contraintes ajoutées pendant le même lot, utiliser `colonne_enum::text IN (...)` ou `NOT IN (...)`. Garder malgré tout l’ajout de l’enum séparé de la migration des colonnes et contraintes pour rendre l’ordre explicite.