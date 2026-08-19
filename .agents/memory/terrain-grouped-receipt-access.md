---
name: Reçus de pesée groupée — autorisation
description: Règle de périmètre pour l'historique peseur et les reçus de livraison.
---

Un peseur peut télécharger le reçu d'une livraison qu'il a créée directement,
qu'il a enregistrée comme peseur, ou qu'il a réalisée via la session de pesée
source. Les contrôles d'accès aux reçus doivent utiliser ces trois chemins,
comme la liste « Mes collectes ».

**Why:** pour une pesée groupée d'un peseur rattaché, la livraison peut être
imputée au délégué tandis que la traçabilité du peseur est conservée dans
`peseurId`. Vérifier uniquement l'agent imputé masque un reçu pourtant visible
dans son historique.

**How to apply:** toute nouvelle route d'action sur une livraison affichée au
peseur doit aligner sa règle de propriété avec celle de l'historique et garder
le filtre de coopérative.