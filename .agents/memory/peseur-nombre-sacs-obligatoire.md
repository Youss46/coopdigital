---
name: Nombre de sacs obligatoire pour les peseurs
description: Règle métier appliquée aux collectes et aux sessions de pesée terrain
---

## Règle
Tout passage enregistré par un peseur doit déclarer un nombre entier de sacs strictement supérieur à zéro.

**Why:** le nombre de sacs sert à la traçabilité de la pesée et au calcul automatique de la tare; une valeur par défaut masquait les saisies incomplètes.

**How to apply:** contrôler la valeur dans les deux parcours terrain, dans les synchronisations hors ligne et dans les services API avant toute écriture.