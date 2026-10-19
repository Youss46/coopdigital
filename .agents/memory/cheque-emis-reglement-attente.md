---
name: Chèque émis rejeté ou annulé
description: Cohérence entre le statut d’un chèque émis, son règlement et sa livraison.
---

Quand un chèque émis lié à un règlement est rejeté ou annulé, le règlement revient en attente et le montant du chèque est rétabli dans le solde de livraison, plafonné au montant net restant dû. Le statut de la livraison est `EN_ATTENTE` si tout le solde est dû, sinon `PARTIEL`. Les informations de validation du règlement sont effacées, tandis que le motif du chèque reste traçable.

**Why:** Un chèque non encaissable ne constitue plus un règlement valide; rétablir seulement le statut tout en gardant un solde nul masque le montant dans Règlements.

**How to apply:** Verrouiller le chèque et effectuer la transition du chèque, du paiement et de la livraison dans une seule transaction. Ajouter le montant du chèque au reste dû, sans dépasser le montant net de la livraison. Toute erreur doit annuler l’ensemble.