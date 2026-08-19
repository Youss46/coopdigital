---
name: Période campagne du tableau de bord
description: Le tableau de bord général doit transmettre explicitement le mode campagne afin que l'API agrège par campagne active.
---

Le filtre « Toute la campagne » du tableau de bord doit envoyer un mode de période explicite à l'API. Quand il n'envoie ni dates ni mode, l'API interprète la requête comme le mois en cours, tandis que la liste des dernières livraisons reste non filtrée.

**Why:** cette combinaison affiche des livraisons existantes avec un tonnage à zéro dès que les livraisons appartiennent à un mois antérieur de la campagne.

**How to apply:** pour le mode campagne, l'API doit préférer l'identifiant de la campagne ouverte pour agréger les livraisons, comme la vue PCA; les autres modes utilisent leurs bornes de date.