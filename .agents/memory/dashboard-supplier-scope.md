---
name: Dashboard supplier scope
description: Périmètre des indicateurs de livraison du tableau de bord.
---

Les indicateurs de livraisons du tableau de bord doivent filtrer une coopérative par `membres.cooperative_id OR fournisseurs.cooperative_id`, car une livraison fournisseur possède `membre_id = NULL`. Ils ne doivent pas exclure les lignes avec `peseur_id` renseigné.

**Why:** les livraisons de fournisseurs externes étaient absentes du tonnage, du nombre de sacs et des dernières livraisons malgré leur enregistrement correct; le dashboard PCA excluait en plus les pesées réalisées par un peseur.

**How to apply:** toute nouvelle agrégation ou liste de livraisons multi-source doit joindre les deux tables avec des `LEFT JOIN` et appliquer le périmètre coopérative sur l’une ou l’autre.