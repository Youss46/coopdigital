---
name: Salary group payment idempotency
description: Concurrent salary batch retries must lock bulletins before treasury debits.
---

Un paiement groupé de salaires doit verrouiller les bulletins dans un ordre stable avant de débiter la trésorerie, puis relire leur statut sous le même verrou. Les débits caisse, banque et mobile doivent utiliser la transaction porteuse.

**Why:** Deux retries réseau peuvent charger simultanément des bulletins validés; sans verrou partagé, le même salaire est débité plusieurs fois.

**How to apply:** Toute évolution du endpoint groupé doit conserver le verrouillage `FOR UPDATE`, le prédicat de transition `valide → paye` et la fixture PostgreSQL concurrente.