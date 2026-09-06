---
name: Salary payment idempotency
description: Concurrent individual and batch salary retries must lock bulletins before treasury debits.
---

Tout paiement de salaires, individuel comme groupé, doit verrouiller les bulletins dans un ordre stable avant de débiter la trésorerie, puis relire leur statut sous le même verrou. Les débits caisse, banque et mobile doivent utiliser la transaction porteuse.

**Why:** Deux retries réseau peuvent charger simultanément des bulletins validés; sans verrou partagé, le même salaire est débité plusieurs fois.

**How to apply:** Toute évolution des endpoints de paiement doit conserver le verrouillage `FOR UPDATE`, le prédicat de transition `valide → paye`, les débits sur la transaction porteuse et une fixture PostgreSQL concurrente.