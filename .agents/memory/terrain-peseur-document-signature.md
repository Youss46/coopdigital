---
name: Peseur sur documents terrain
description: Règle de traçabilité du peseur central sur les documents de collecte et de réception.
---

Toute pesée réalisée par un compte dont le rôle est `peseur` doit enregistrer son identifiant comme `peseurId`, y compris lorsque la pesée simple est enregistrée directement sans mode proxy.

**Why:** Les documents fournisseur externe et les bordereaux de bons de réception doivent identifier la personne qui signe; laisser `peseurId` vide supprime son nom du document.

**How to apply:** Lors de la résolution de l’agent effectif, conserver l’utilisateur connecté comme peseur pour les comptes `peseur`; afficher ensuite son nom dans la zone de signature correspondante.