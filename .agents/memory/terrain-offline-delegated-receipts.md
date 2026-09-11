---
name: Offline delegated-member receipts
description: Offline weighing drafts for delegated members must retain the existing receipt link.
---

Les données Terrain hors ligne d’un membre délégué doivent conserver chaque bon de réception encore en attente avec ses informations d’affichage. Le peseur choisit explicitement quand plusieurs bons existent, puis le brouillon conserve uniquement l’identifiant choisi avec l’opération `reception_membre_delegue`; un brouillon sans ce lien ne peut pas être synchronisé correctement.

**Why:** Le serveur exige un bon pour créer la session et doit réserver ce bon atomiquement afin d’éviter une réception déléguée sans traçabilité ou une double pesée.

**How to apply:** Charger l’identifiant du bon avec la liste Terrain, ne pas rediriger vers Réceptions quand le navigateur est hors ligne, refuser explicitement le démarrage si aucun bon n’est disponible localement, puis transmettre l’identifiant au batch de synchronisation.