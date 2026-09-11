---
name: Offline business error codes
description: Les synchronisations offline doivent classifier les erreurs métier via le code sérialisé de l’API.
---

Les synchronisations hors ligne doivent s’appuyer sur le champ `code` renvoyé par l’API pour distinguer un rejet métier d’une panne réseau, plutôt que sur l’identité de la classe d’erreur.

**Why:** le navigateur, les tests et les bundles peuvent charger des copies différentes des modules d’erreur; `instanceof` peut alors échouer alors que le code métier est bien présent.

**How to apply:** conserver le brouillon en erreur, afficher le motif métier et son identifiant local, et réserver le libellé réseau aux erreurs de transport explicites.