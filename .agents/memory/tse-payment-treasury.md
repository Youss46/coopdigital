---
name: TSE payment treasury
description: Règles de trésorerie et comptes OHADA utilisés lors du paiement d’une TSE.
---

Le paiement TSE doit proposer espèces, Mobile Marchand, virement bancaire et chèque. Le solde opérationnel de la trésorerie sélectionnée est diminué atomiquement avec l’écriture fiscale.

**Why:** Le paiement fiscal doit refléter la sortie réelle de trésorerie, et non créer seulement une déclaration ou une écriture isolée.

**How to apply:** utiliser 571 pour les espèces, 552 pour Mobile Marchand et 521 pour un compte bancaire; vérifier le solde et enregistrer le mouvement de trésorerie dans la même transaction que la déclaration et l’écriture.