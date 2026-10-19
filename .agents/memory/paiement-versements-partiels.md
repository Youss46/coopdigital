---
name: Versements partiels livraison
description: Règles d’architecture pour régler une livraison en plusieurs versements.
---

Le solde de la livraison est la source de vérité: chaque validation verrouille la livraison, débite uniquement le montant du versement, puis conserve un paiement en attente pour le reliquat si nécessaire. Après le retour d’un chèque, regrouper le montant restauré dans le paiement en attente préexistant au lieu de créer une deuxième ligne pour la même livraison.

**Why:** plusieurs validations concurrentes ne doivent ni dépasser la dette producteur ni dupliquer caisse, chèques ou écritures comptables; un retour de chèque ne doit pas non plus afficher deux montants en attente pour une même dette.

**How to apply:** conserver le statut `PARTIEL` jusqu’à un solde nul; ne jamais utiliser une avance pour représenter le reliquat. Après retour d’un chèque, mettre à jour le paiement en attente préexistant au montant total restant dû et archiver les doublons avec leur motif, dans la même transaction.