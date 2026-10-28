---
name: Annulation des pesées
description: Règles métier pour annuler une livraison issue d’une pesée.
---

Seuls les rôles PCA et Directeur peuvent annuler une pesée déjà enregistrée. Bloquer l’annulation si un règlement est confirmé ou si la livraison est intégrée à un lot. Conserver la livraison dans l’historique avec le statut « Annulée » et l’exclure des listes et totaux actifs.

Les mouvements qui peuvent diminuer un stock et son annulation doivent verrouiller le même entrepôt avant de lire le solde, puis enregistrer le nouveau mouvement dans une transaction. Un règlement encore en cours et un chèque actif bloquent aussi l’annulation; les règlements en attente sont conservés dans l’audit avant suppression avec la livraison.

**Why:** l’utilisateur a choisi ces protections pour éviter les suppressions financières non réversibles tout en gardant une piste d’audit. Les tests de concurrence ont aussi montré qu’une sortie non sérialisée peut sinon passer après la vérification d’annulation et rendre le stock négatif.

**How to apply:** conserver ces règles dans toute nouvelle interface ou opération d’annulation de livraison. Tout nouveau parcours de sortie de stock doit prendre le verrou de ligne de l’entrepôt avant le calcul du solde et garder la mise à jour et le mouvement dans la même transaction.
