---
name: Chèque émis rejeté ou annulé
description: Cohérence entre le statut d’un chèque émis, son règlement et sa livraison.
---

Quand un chèque émis lié à un règlement est rejeté ou annulé, le montant est rétabli dans le solde de livraison, plafonné au montant net restant dû. S’il existe déjà un règlement en attente pour cette livraison, y regrouper le solde restauré au lieu d’afficher une seconde ligne. Garder une seule ligne en attente au montant du reliquat courant; conserver les lignes remplacées en historique avec un motif explicite. Le statut de la livraison est `EN_ATTENTE` si tout le solde est dû, sinon `PARTIEL`.

**Why:** Un chèque non encaissable ne constitue plus un règlement valide; le solde doit redevenir payable sans apparaître en doublon à côté d’un reliquat déjà en attente.

**How to apply:** Verrouiller le chèque, la livraison et les règlements en attente dans une seule transaction. Ajouter le montant du chèque au reste dû, sans dépasser le montant net, puis mettre à jour le règlement en attente préexistant ou conserver un seul nouveau règlement si aucun n’existe. Toute erreur doit annuler l’ensemble.