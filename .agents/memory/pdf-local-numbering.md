---
name: PDF local weighing references
description: Référence métier à afficher sur les reçus et bordereaux de livraison.
---

Les reçus et bordereaux doivent privilégier la référence canonique `PES-S-AAAA-NNNNN`, plutôt que `code_achat` ou `livraisons.id`.

**Why:** les anciens PDF affichaient encore `LIV-00116`, une référence dérivée de l’identifiant SQL global, alors que le rang de pesée est maintenant local à la coopérative.

**How to apply:** sélectionner le rang et son année dans chaque requête PDF. Le reçu de paiement reprend exactement cette référence sous « N° de pesée » pour être rapproché du bordereau, sans fallback sur l’ID SQL.