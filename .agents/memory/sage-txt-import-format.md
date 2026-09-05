---
name: Format import Sage 100
description: Format de lignes attendu par l’import TXT Sage 100 i7.
---

Le format des lignes d’écritures exportées vers Sage 100 i7 est :

`date;journal;pièce;compte;libellé;débit;crédit`

La devise est indiquée dans l’en-tête (`#DEV XOF`) et ne doit pas être répétée comme huitième colonne. Les libellés doivent rester en caractères ASCII simples : les tirets typographiques et accents sont normalisés pour éviter le rejet de Sage i7.

**Why:** Sage signale une incohérence dès la première ligne de données lorsqu’il reçoit le compte avant la pièce, une colonne devise supplémentaire ou une ponctuation UTF-8 non supportée.

**How to apply:** Toute évolution de `buildSageTxt` doit préserver cet ordre et maintenir un test avec une pièce et un compte distincts.