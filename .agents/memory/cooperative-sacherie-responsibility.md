---
name: Configuration du responsable Sacherie
description: Règle de configuration tenant-scoped pour choisir le rôle opérationnel de la Sacherie.
---

La responsabilité opérationnelle Sacherie est configurée par coopérative avec trois modes : `magasinier`, `sacherie` ou `les_deux`. Le défaut `les_deux` préserve le comportement historique. Cette configuration ne désactive jamais le rôle Magasinier globalement : elle limite uniquement les écritures Sacherie (mouvements, types et ajustements), avec PCA et Directeur toujours autorisés.

**Why:** désactiver le rôle Magasinier via la configuration globale des rôles couperait aussi ses autres fonctions de stock.

**How to apply:** toute nouvelle route d’écriture Sacherie doit passer par le contrôle tenant-scoped de responsabilité, et toute modification doit rester administrable depuis M15.