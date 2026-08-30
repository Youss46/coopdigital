---
name: Idempotence sous verrou
description: Règle de concurrence pour les opérations idempotentes qui modifient un stock ou une ressource partagée.
---

Une vérification d’idempotence effectuée avant l’acquisition d’un verrou ne suffit pas : après avoir verrouillé la ressource métier, il faut relire la référence avant l’insertion.

**Why:** Deux requêtes concurrentes peuvent toutes deux constater l’absence de la référence avant que l’une d’elles ne valide son écriture. La contrainte unique protège la base, mais transforme le retry légitime en erreur au lieu de renvoyer le résultat existant.

**How to apply:** Verrouiller la ligne ou le périmètre qui sérialise le calcul métier, relire la référence dans la même transaction, comparer les paramètres de la requête, puis seulement calculer le solde et insérer.