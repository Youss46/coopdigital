---
name: Création des livraisons par pesée uniquement
description: Les livraisons ne doivent jamais être saisies depuis la page générale Livraisons.
---

La page Livraisons est une interface de consultation בלבד; toute création passe par les parcours de pesée dédiés du peseur (terrain ou session centrale).

**Why:** La responsabilité de la saisie physique appartient au peseur et un bouton ou une route générale permettrait de contourner la traçabilité de la pesée.

**How to apply:** Masquer tous les liens vers Nouvelle livraison, rediriger l’ancienne URL et refuser le POST générique `/api/livraisons`; ne pas bloquer les endpoints dédiés aux parcours de pesée.