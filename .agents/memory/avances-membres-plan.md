---
name: Avances membres — plan et décaissement
description: Règles de retenue et de trésorerie lors de l’octroi d’une avance à un membre.
---

Une avance membre conserve un plan de retenue flexible (`integral`, `partiel` ou `reporte`). Lors de son octroi, le moyen de décaissement doit être choisi parmi espèces, Mobile Marchand et banque.

**Why:** l’octroi est une sortie réelle de fonds. La caisse centrale, le compte Mobile Marchand ou le compte bancaire correspondant doit être débité du montant exact dans la même transaction que la création de l’avance.

**How to apply:** toujours afficher et transmettre `modePaiement` dans tous les formulaires d’octroi, y compris les opérations hors ligne. Refuser l’opération si la trésorerie choisie est absente, fermée ou insuffisante.