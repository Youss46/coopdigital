---
name: Expéditions historiques sans lignes de lot
description: Règle de réparation des expéditions anciennes qui ont un poids mais aucun rattachement technique de lot.
---

Une expédition historique peut avoir `poids_charge_kg` et `lieu_depart` sans aucune ligne dans `expedition_lots`. Pour réparer la sortie de stock, utiliser le poids déclaré et l'entrepôt de départ uniquement si cet entrepôt appartient à la même coopérative et existe réellement.

**Why:** les anciennes saisies n’avaient pas toujours de rattachement technique de lot. Ignorer ces expéditions laisse le stock inchangé ; créer une sortie sans entrepôt vérifié débiterait une destination inconnue.

**How to apply:** conserver le traitement par lots quand des lignes existent ; appliquer le fallback seulement pour une liste vide, avec poids strictement positif et résolution de l’entrepôt normalisée (`lower(trim(nom))`). Si l’entrepôt par défaut n’existe pas, conserver un no-op explicite.