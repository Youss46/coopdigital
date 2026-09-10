---
name: Atomicité des réceptions d’expédition
description: Contraintes transactionnelles du parcours de réception au port
---

La confirmation de réception doit verrouiller l’expédition puis exécuter dans un même client transactionnel la réparation des sorties de chargement, la mise à jour de réception, l’historique, les traitements de refus et les écritures OHADA.

**Pourquoi:** une erreur de base ou d’écriture après la création d’une sortie peut sinon laisser une réception partiellement enregistrée, avec un stock et un statut incohérents.

**How to apply:** utiliser la variante transactionnelle de la réparation stock et `proposerEcrituresDansTransaction`; ne pas absorber les erreurs dans la transaction. Une source d’entrepôt manquante doit faire échouer la réception plutôt que continuer silencieusement.