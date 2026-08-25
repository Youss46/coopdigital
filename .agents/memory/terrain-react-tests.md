---
name: Tests React du terrain
description: Contraintes d’environnement pour tester le rendu des composants React du terrain.
---

Les tests de rendu React du terrain doivent activer `jsdom` au niveau du fichier plutôt que pour toute la suite, et la configuration Vitest doit charger le plugin React pour transformer les imports `.tsx`.

**Why:** La suite contient aussi des tests Node purs, tandis que le runtime du workspace est incompatible avec certaines versions récentes de jsdom.

**How to apply:** Pour un nouveau test de composant, conserver l’environnement Node par défaut, ajouter le pragma jsdom au test concerné et réutiliser la dépendance jsdom compatible déjà déclarée par le paquet terrain.