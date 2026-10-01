---
name: Avances membres — plan et décaissement
description: Règles de retenue et de trésorerie lors de l’octroi d’une avance à un membre.
---

Une avance membre conserve un plan de retenue flexible (`integral`, `partiel` ou `reporte`). Lors de son octroi, le moyen de décaissement doit être choisi parmi espèces, Mobile Marchand et banque.

**Why:** l’octroi est une sortie réelle de fonds. La caisse centrale, le compte Mobile Marchand ou le compte bancaire correspondant doit être débité du montant exact dans la même transaction que la création de l’avance.

**How to apply:** toujours afficher et transmettre `modePaiement` dans tous les formulaires d’octroi, y compris les opérations hors ligne. Refuser l’opération si la trésorerie choisie est absente, fermée ou insuffisante. Respecter `deductionSource`: `livraison` réduit le net de la livraison, `commission` est réservé au règlement de commission et ne doit pas être retenu sur une livraison. `reportDate` est le début d’éligibilité de la retenue; `dateEcheance` est une limite de remboursement et ne déclenche jamais un débit automatique.

Lors d’une correction négociée de la date d’application, la date choisie remplace aussi l’échéance. À l’octroi, `reportDate` et `dateEcheance` peuvent rester distinctes.
**Why:** le report de l’avance en cours doit mettre à jour le calendrier de remboursement montré à l’utilisateur, sans effacer la distinction disponible à l’octroi.
**How to apply:** dans la correction négociée, enregistrer la date choisie dans `reportDate` et `dateEcheance`; traiter une avance comme « En cours » jusqu’à cette date incluse, puis comme « En retard » si elle reste due. Les listes doivent présenter cette échéance effective pour les anciens enregistrements où `reportDate` est postérieure à `dateEcheance`.