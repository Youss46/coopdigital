---
name: Terrain idle session timeout
description: Idle logout behavior for the mobile terrain application.
---

Une session terrain se ferme après 30 minutes sans activité utilisateur. Le dernier horodatage d’activité doit être conservé avec l’authentification, contrôlé au démarrage, puis vérifié au retour au premier plan et au focus.

**Why:** Un JWT peut rester techniquement valide sans qu’aucune requête ne soit faite. Les navigateurs mobiles suspendent les minuteurs en arrière-plan et un redémarrage de l’application réinitialise la mémoire ; sans horodatage persistant, un téléphone partagé peut donc rouvrir l’espace opérationnel après une longue absence.

**How to apply:** Les requêtes automatiques et les rafraîchissements en arrière-plan ne comptent pas comme une activité. Réinitialiser le délai persistant sur interaction explicite, comparer l’horodatage au démarrage et au retour de l’application, puis supprimer toute authentification expirée.