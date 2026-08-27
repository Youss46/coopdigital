---
name: Versements partiels livraison
description: Règles d’architecture pour régler une livraison en plusieurs versements.
---

Le solde de la livraison est la source de vérité: chaque validation verrouille la livraison, débite uniquement le montant du versement, puis crée un paiement en attente pour le reliquat si nécessaire.

**Why:** plusieurs validations concurrentes ne doivent ni dépasser la dette producteur ni dupliquer caisse, chèques ou écritures comptables.

**How to apply:** conserver le statut `PARTIEL` jusqu’à un solde nul; ne jamais utiliser une avance pour représenter le reliquat et préserver le même périmètre de validation pour chaque nouveau versement.