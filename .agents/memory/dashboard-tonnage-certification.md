---
name: Carte tonnage certification
description: Fiabilité de l’agrégation des livraisons par certification de pesée.
---

Le détail « Tonnage par certification » doit échouer explicitement dans l’interface si son endpoint échoue ; une liste vide ne signifie pas nécessairement qu’il n’y a aucune livraison. La certification utilisée est celle enregistrée dans la session de pesée, pas la certification administrative éventuelle du membre.

**Why:** Une jointure SQL vers une table inexistante a retourné une erreur 500, transformée silencieusement par le front en « Aucune livraison sur cette période », alors que le total de tonnage global restait correct.

**How to apply:** Toute modification de l’agrégat doit conserver le lien session de pesée → livraison et tester le chemin d’erreur de l’endpoint, en particulier lorsque le tableau de bord affiche un total mais que son détail est vide.