---
name: Réparations techniques hors parcours métier
description: Convention pour les outils de rattrapage liés aux anciennes données.
---

Les actions de réparation destinées aux anciennes données ne doivent pas apparaître dans le parcours métier normal. Elles peuvent rester disponibles côté serveur pour une intervention contrôlée, à condition de rester idempotentes.

**Why:** afficher un outil de maintenance sur chaque enregistrement valide crée une alerte inutile et peut faire croire qu’une action corrective est toujours nécessaire.

**How to apply:** masquer l’action dans l’interface métier ; si des réparations récurrentes sont nécessaires, créer ensuite une action d’administration explicitement identifiée et protégée plutôt que de la rattacher à une transition métier normale.