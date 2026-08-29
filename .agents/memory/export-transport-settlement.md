---
name: Export transport settlement
description: Règles durables du règlement des frais de transport liés aux expéditions.
---

Le règlement des frais de transport réutilise la transaction métier de l’expédition : le mouvement de caisse ou de banque, la mise à jour du solde, l’écriture 401 vers 571/521 et le statut payé sont inséparables.

**Why:** Un mouvement de trésorerie isolé pouvait laisser une dette fournisseur ouverte ou créer un double règlement lors de requêtes concurrentes.

**How to apply:** utiliser la source comptable `transport` pour respecter le paramètre `autoTransport`; verrouiller l’expédition avant tout débit; refuser les expéditions en litige ou annulées.