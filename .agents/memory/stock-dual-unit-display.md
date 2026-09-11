---
name: Affichage double des tonnages
description: Convention d’affichage des poids sur les cartes de synthèse du stock.
---

Les cartes de synthèse du stock affichent le poids exact en kilogrammes comme valeur principale, puis le tonnage exact à trois décimales avec le nombre de sacs en secondaire.

**Why:** les kilogrammes servent aux rapprochements opérationnels, tandis que le tonnage est l’unité de lecture attendue pour les indicateurs de gestion. Afficher uniquement des tonnes à deux décimales peut masquer plusieurs kilogrammes.

**How to apply:** conserver la valeur en kg comme référence ; formater les tonnes avec trois décimales et une virgule française (`6,077 t`), sans remplacer la donnée source ni arrondir les calculs métier.