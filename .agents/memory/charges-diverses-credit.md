---
name: Charges diverses à crédit
description: Structure comptable et fonctionnelle d’une charge diverse non réglée immédiatement.
---

Une charge à crédit utilise le mode `credit`, le compte 401 Fournisseurs et aucun compte de trésorerie; le fournisseur est obligatoire.

**Why:** La validation constate la charge et la dette sans mouvement de caisse, banque ou Mobile Money; le règlement fournisseur doit être une opération séparée.

**How to apply:** Débiter le compte de charge et créditer 401 à la validation, puis solder 401 contre la trésorerie lors du paiement ultérieur.

Pour une charge PPSI à crédit, ne pas produire non plus l’écriture de règlement net vers 571, 521 ou 552; le paiement et sa retenue sont des opérations ultérieures.

**Why:** La branche PPSI calculait historiquement un règlement immédiat par défaut, ce qui pouvait débiter une trésorerie malgré le mode `credit`.

**How to apply:** Traiter le mode `credit` comme une dette fournisseur brute lors de la validation, quelle que soit la catégorie de charge.