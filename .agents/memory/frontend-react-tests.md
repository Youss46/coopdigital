---
name: Inputs contrôlés en tests React
description: Particularité jsdom du workspace pour simuler les changements de champs contrôlés React.
---

Pour tester un champ texte contrôlé React avec le jsdom partagé du workspace, affecter sa valeur via le setter natif de `HTMLInputElement.prototype.value`, puis déclencher un événement `input` bouillonnant.

**Why:** Une affectation directe de `.value` peut mettre à jour le tracker de valeur de React sans déclencher son gestionnaire `onChange`, laissant l’état du composant inchangé.

**How to apply:** Utiliser cette séquence dans les tests de composants contrôlés avant d’asserter les calculs ou de cliquer sur une action qui dépend de la saisie.