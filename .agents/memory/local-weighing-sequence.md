---
name: Local weighing sequence
description: Règle de numérotation des pesées simples et des sessions de pesée.
---

Les numéros de pesée sont réservés atomiquement par coopérative et par année civile, puis partagés entre les pesées simples et les sessions groupées. `livraisons.id` et les autres identifiants SQL restent globaux et ne servent jamais d’identifiant métier affiché.

**Why:** une nouvelle coopérative pouvait afficher le prochain ID PostgreSQL global comme sa première pesée, et les pesées simples risquaient aussi de chevaucher les sessions.

**How to apply:** toute nouvelle création issue d’une pesée doit réserver le compteur local et persister le rang; les anciennes lignes sans rang conservent leur référence historique via un fallback.