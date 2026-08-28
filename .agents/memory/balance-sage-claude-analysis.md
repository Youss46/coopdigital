---
name: Balance Sage Claude analysis
description: Boundary between analysable imported balance rows and rows that must block accounting reprise preparation.
---

Une ligne Sage dont le compte est absent du plan coopératif peut être analysée par Claude si ses montants sont valides et non nuls; seules les erreurs de données doivent empêcher l’analyse.

**Why:** Bloquer toutes les lignes marquées d’une erreur empêchait le bouton Claude de fonctionner précisément lorsque l’import nécessitait une aide de rattachement.

**How to apply:** Séparer l’éligibilité à l’analyse IA de l’éligibilité à la préparation comptable; la préparation doit toujours refuser les comptes inconnus ou les lignes invalides. Les services IA doivent partager `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` et `ANTHROPIC_BASE_URL`, avec le même modèle par défaut.