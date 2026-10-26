---
name: Annulation des pesées
description: Règles métier pour annuler une livraison issue d’une pesée.
---

Seuls les rôles PCA et Directeur peuvent annuler une pesée déjà enregistrée. Bloquer l’annulation si un règlement est confirmé ou si la livraison est intégrée à un lot. Conserver la livraison dans l’historique avec le statut « Annulée » et l’exclure des listes et totaux actifs.

**Why:** l’utilisateur a choisi ces protections pour éviter les suppressions financières non réversibles tout en gardant une piste d’audit.

**How to apply:** conserver ces mêmes règles dans toute nouvelle interface ou opération d’annulation de livraison; ne pas réintroduire les lignes annulées dans les agrégats opérationnels.
