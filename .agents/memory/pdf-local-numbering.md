---
name: PDF local weighing references
description: Référence métier à afficher sur les reçus et bordereaux de livraison.
---

Les reçus et bordereaux doivent privilégier `numero_pesee`, au format `PES-S-<rang>`, plutôt que `code_achat` ou `livraisons.id`.

**Why:** les anciens PDF affichaient encore `LIV-00116`, une référence dérivée de l’identifiant SQL global, alors que le rang de pesée est maintenant local à la coopérative.

**How to apply:** sélectionner `numero_pesee` dans chaque requête de génération PDF; conserver un fallback legacy uniquement pour les livraisons historiques qui n’ont pas encore de rang local.