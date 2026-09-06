---
name: Assertions de concurrence trésorerie
description: Règle de test pour les virements banque-caisse concurrents.
---

Les tests de virements concurrents doivent valider les mouvements, les soldes finaux et l’ensemble des séquences intermédiaires valides, sans imposer lequel des deux appels obtient le verrou en premier.

**Why:** PostgreSQL sérialise correctement les transactions, mais l’ordre d’acquisition du verrou dépend de l’ordonnancement concurrent et peut varier entre exécutions.

**How to apply:** Pour une assertion de solde après mouvement, accepter les deux ordres mathématiquement cohérents puis vérifier séparément le solde final et l’absence de double effet financier.