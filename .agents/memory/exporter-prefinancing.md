---
name: Préfinancements exportateurs
description: Règle métier de récupération des avances reçues des exportateurs avant la vente du cacao.
---

Les avances reçues par chèque d’un exportateur avant la vente de cacao sont généralement récupérées par compensation sur les ventes futures réellement enregistrées avec cet exportateur.

Lorsqu’une vente est refusée, partiellement ou totalement, restituer intégralement les imputations liées à cette vente au disponible des avances. Conserver leur historique et contrepasser les écritures d’imputation; le montant restitué redevient dû sur la partie de vente conservée.

**Why:** l’utilisateur a confirmé la compensation sur les ventes futures plutôt qu’un remboursement séparé, a choisi de libérer toute l’avance imputée même lors d’un refus partiel et préfère des références métier aux identifiants techniques dans la fiche.

**How to apply:** traiter ce flux comme une avance client distincte d’un emprunt remboursable. N’imputer que sur des ventes réelles du même exportateur; distinguer les chèques en attente, encaissés, imputés et restitués. Pour les références bancaires affichées, montrer le nom de compte/banque et la référence du chèque avec sa date, pas les ID techniques.