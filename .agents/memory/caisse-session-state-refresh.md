---
name: Synchronisation de l’état des sessions de caisse
description: Les onglets de caisse partagent l’état des sessions via le parent de la page.
---

Après toute mutation de session ou de solde depuis un onglet enfant, rafraîchir la liste des caisses détenue par la page parent, pas seulement le journal local.

**Why:** Une fermeture peut réussir côté API alors qu’un onglet conserve l’ancien statut `ouverte`; l’utilisateur retente alors l’action et reçoit « aucune session ouverte ».

**How to apply:** Passer un callback de rafraîchissement au journal et l’appeler après ouverture, mouvement, virement et fermeture; conserver le rechargement du journal pour ses lignes.