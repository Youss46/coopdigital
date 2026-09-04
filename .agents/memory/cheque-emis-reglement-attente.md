---
name: Chèque émis rejeté ou annulé
description: Cohérence entre le statut d’un chèque émis, son règlement et sa livraison.
---

Quand un chèque émis lié à un règlement est rejeté ou annulé, le règlement et la livraison doivent repasser en attente. Les informations de validation du règlement sont effacées, tandis que le motif du chèque reste traçable.

**Why:** Un chèque non encaissable ne constitue plus un règlement valide; laisser le paiement comme effectué ou confirmé fausse les encours et les indicateurs.

**How to apply:** Verrouiller le chèque et effectuer la transition du chèque, du paiement et de la livraison dans une seule transaction. Toute erreur doit annuler l’ensemble.