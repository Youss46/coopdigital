---
name: Modification de l’identité des comptes
description: Le PCA et le Directeur peuvent modifier le nom et les prénoms d’un compte depuis Administration.
---

La modification du nom et des prénoms d’un utilisateur se fait via l’édition du compte dans Administration; l’API doit vérifier le rôle PCA/Directeur, l’appartenance à la coopérative et refuser les valeurs vides.

**Why:** Les informations affichées sur les reçus, signatures et notifications dépendent du profil utilisateur central.

**How to apply:** Conserver un formulaire d’identité séparé des actions de mot de passe et de mode de gestion, avec rafraîchissement de la liste après succès.