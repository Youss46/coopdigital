---
name: Commission advance retention caps
description: Accounting rule for applying member advances against delegate commissions.
---

Lors du paiement d’une commission, mettre à jour une avance avec la retenue réellement répartie sur les commissions, et non avec la retenue prévue par son plan. Une avance qui dépasse les commissions disponibles conserve son solde restant.

**Why:** Comptabiliser une retenue plafonnée tout en soldant l’avance entière crée un écart entre dette du membre et écritures comptables.

**How to apply:** Toute boucle qui affecte des avances à un revenu doit calculer la somme réellement affectée après plafonnement par le revenu, mettre à jour le solde avec cette somme, et laisser les avances sans affectation inchangées. Pour une livraison avec charges, imputer d'abord carburant puis autres charges, puis plafonner l'avance au solde payable : les débits du compte membre ne doivent jamais dépasser l'achat crédité. Conserver séparément les charges avancées (coût intégral) et les charges récupérées (retenue effective) pour l'audit comptable. Lors d'un règlement concurrent, verrouiller la commission et sérialiser le membre avant de créer l'historique de remboursement et les écritures.