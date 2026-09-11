---
name: Sorties stock des expéditions
description: Règles de liaison entre chargement d’expédition et sorties de stock
---

Les sorties de stock d’une expédition sont enregistrées au chargement depuis les lots rattachés. Comme `mouvements_stock` ne possède pas de colonne `expedition_id`, le motif `Chargement expédition <numéro>` est l’identifiant métier d’idempotence.

**Pourquoi:** les noms d’entrepôts historiques peuvent différer par la casse ou les espaces entre un lot et la fiche entrepôt. Sans normalisation, l’expédition peut atteindre « Réceptionnée » alors qu’aucune sortie n’est créée.

**How to apply:** normaliser les noms lors de la résolution, ignorer une insertion si le même motif existe déjà dans l’entrepôt, et rejouer cette vérification à la réception pour réparer les anciennes expéditions sans doublon.

Les anciennes lignes `expedition_lots` peuvent porter un poids sans `lot_id` : dans ce cas, utiliser `expeditions.lieu_depart` comme source de secours. Une expédition sans aucune ligne de lot reste un parcours sans effet stock et ne doit pas fabriquer une sortie.