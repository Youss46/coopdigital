---
name: Sage auxiliary account emptiness
description: Sage exports must leave the auxiliary account field empty when no custom third-party account is configured.
---

Le champ compte tiers de l’export TXT Sage doit rester vide lorsqu’aucun compte auxiliaire personnalisé n’est associé au tiers. Les identifiants techniques de type MEM/FOU/CLI ne doivent jamais servir de valeur de remplacement dans ce champ.

**Why:** Sage interprète le dernier champ comme le compte auxiliaire ; une valeur technique ou `00` crée un compte tiers incorrect au lieu de laisser l’écriture sur le collectif.

**How to apply:** Émettre uniquement le numéro de compte personnalisé configuré pour le collectif concerné ; sinon émettre une chaîne vide.