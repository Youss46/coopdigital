---
name: Cohérence paiement-livraison
description: Règle de recalcul des états de règlement des livraisons à partir des paiements confirmés.
---

`livraisons.statut_paiement` et `montant_restant` doivent être recalculés à partir de la somme des paiements `confirme` ou `effectue` liés. Ne pas faire confiance à un ancien état de livraison isolé.

**Why:** Des cartes de règlement affichaient un paiement `effectue` tout en conservant la livraison à « À régler », ce qui rendait l’interface contradictoire.

**How to apply:** Après une correction de données ou une migration historique, montant réglé >= montant net signifie `PAYÉ` et solde zéro; sinon un montant réglé positif signifie `PARTIEL` avec le reliquat calculé.