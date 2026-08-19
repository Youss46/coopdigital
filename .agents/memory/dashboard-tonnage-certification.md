---
name: Carte tonnage certification
description: Fiabilité de l’agrégation des livraisons par certification de pesée.
---

Le détail « Tonnage par certification » doit échouer explicitement dans l’interface si son endpoint échoue ; une liste vide ne signifie pas nécessairement qu’il n’y a aucune livraison. La certification utilisée est celle déclarée au moment de la pesée, et doit être figée également sur la livraison — la session n’est qu’une source de reprise pour l’historique.

**Why:** Une jointure SQL vers une table inexistante a retourné une erreur 500, transformée silencieusement par le front en « Aucune livraison sur cette période », alors que le total de tonnage global restait correct.

**How to apply:** Toute création de livraison depuis une session doit copier la certification sur la livraison. L’agrégat lit d’abord ce snapshot, puis utilise la session liée pour les données historiques. Les livraisons sans donnée fiable doivent apparaître dans une catégorie explicite « Certification non déclarée », jamais disparaître du détail.