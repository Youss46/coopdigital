---
name: Atomicité des paiements de primes
description: Règle de cohérence entre statut producteur, trésorerie, avances et comptabilité lors d’un paiement de prime.
---

Le paiement d’une prime producteur doit exécuter le changement de statut, la réduction des avances, le mouvement de trésorerie et la proposition d’écriture OHADA dans une transaction commune. Les services appelés dans ce parcours doivent accepter le client transactionnel ; une erreur comptable doit remonter pour déclencher le rollback.

**Why:** Une écriture lancée en arrière-plan ou un débit dans une transaction imbriquée peut laisser une prime marquée payée avec une trésorerie ou une comptabilité incomplète.

**How to apply:** Pour tout nouveau canal de paiement de prime, ne pas utiliser les helpers non transactionnels dans la transaction métier et ne jamais intercepter silencieusement une erreur de mouvement ou d’écriture.