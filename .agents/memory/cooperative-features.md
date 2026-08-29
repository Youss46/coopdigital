---
name: Coopérative feature configuration
description: Décisions durables pour l’activation des modules par coopérative.
---

La configuration d’une fonctionnalité est additive : lorsqu’aucune ligne n’existe pour une coopérative, le mode effectif est `active`, afin de préserver le comportement des coopératives existantes.

**Why:** La fonctionnalité a été introduite sans migration de données de configuration pour éviter de masquer ou de casser les modules déjà utilisés.

**How to apply:** Toute nouvelle fonctionnalité doit être ajoutée au catalogue global avec ses dépendances. La désactivation d’un parent doit désactiver en cascade ses dépendants; le contrôle doit rester ordonné licence → fonctionnalité → permission.