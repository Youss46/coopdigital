---
name: Numéro obligatoire pour un règlement par chèque
description: Règle métier pour les règlements par chèque seuls ou ventilés.
---

Tout règlement comportant un moyen de paiement par chèque exige un numéro de chèque non vide après suppression des espaces superflus. Dans un règlement ventilé, chaque ligne réglée par chèque doit porter son propre numéro.

**Why:** l’utilisateur a explicitement demandé que le numéro soit obligatoire lors du choix du chèque.

**How to apply:** faire respecter cette règle dans l’interface et l’API, avant tout effet financier, pour tout parcours de règlement par chèque.
