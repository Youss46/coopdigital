---
name: Atomicité du chargement d’expédition
description: Contraintes transactionnelles du passage d’une expédition en chargée
---

Le passage en chargée doit exécuter dans la même transaction le verrou de l’expédition, les sorties de tous les entrepôts sources, le passage des lots en transit, le total de sacs, l’historique et l’écriture comptable 381/311.

**Pourquoi:** une erreur de sortie stock ou de comptabilité après la mise à jour du statut produirait une expédition chargée sans tous ses effets métier.

**How to apply:** appeler la variante transactionnelle de la déduction stock et `proposerEcrituresDansTransaction`; ne pas absorber les erreurs du chargement. Tester le rollback après une première sortie réussie et la reprise après correction.