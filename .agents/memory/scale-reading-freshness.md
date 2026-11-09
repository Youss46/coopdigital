---
name: Fraîcheur des lectures de bascule
description: Diagnostic confirmé pour une lecture qui reste affichée après le retrait d’une charge.
---

Sur la coopérative testée, l’indicateur physique et le lecteur RS-232 reviennent à 0 kg à vide. La correction validée consiste à effacer un poids après 3 secondes sans trame, sans confondre une interruption du flux avec une déconnexion matérielle.

**Why:** le lecteur était capable de restituer zéro; le défaut venait de l’ancienne valeur conservée à l’écran, et l’utilisateur a confirmé que le parcours fonctionne après cette correction.

**How to apply:** si un poids reste affiché, vérifier d’abord si le lecteur envoie encore des trames et si l’écran reçoit la valeur zéro avant de modifier le parseur ou le calibrage physique.
