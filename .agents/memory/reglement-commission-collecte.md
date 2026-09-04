---
name: Règlement avec commission de collecte
description: Règle métier pour payer le net cacao seul ou avec la commission liée sans double débit.
---

Le montant restant de la livraison représente uniquement la dette cacao après les charges déjà déduites. Une commission de collecte liée à la session est une dette distincte : l’option « net seul » ne la touche pas; l’option « tout payer » ajoute la commission au décaissement, mais ne diminue le solde livraison que du net cacao.

**Why:** La commission ne doit être ni repaidée dans le net producteur, ni marquée payée avant son décaissement. Les deux choix doivent conserver la cohérence entre trésorerie, paiement, solde livraison et écritures.

**How to apply:** Toujours vérifier côté serveur que la commission est encore en attente et rattachée au même membre/session. Dans une ventilation multi-moyens, affecter d’abord les lignes au paiement producteur puis le reliquat à la commission; faire les mises à jour dans la même transaction.