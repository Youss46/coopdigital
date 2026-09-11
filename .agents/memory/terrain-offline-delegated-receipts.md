---
name: Offline delegated-member receipts
description: Offline weighing drafts for delegated members must retain the existing receipt link.
---

Les brouillons de pesée hors ligne d’un membre délégué doivent conserver l’identifiant du bon de réception déjà synchronisé, ainsi que l’opération `reception_membre_delegue`; un brouillon sans ce lien ne peut pas être synchronisé correctement.

**Why:** Le serveur exige un bon pour créer la session et doit réserver ce bon atomiquement afin d’éviter une réception déléguée sans traçabilité ou une double pesée.

**How to apply:** Charger l’identifiant du bon avec la liste Terrain, ne pas rediriger vers Réceptions quand le navigateur est hors ligne, refuser explicitement le démarrage si aucun bon n’est disponible localement, puis transmettre l’identifiant au batch de synchronisation.