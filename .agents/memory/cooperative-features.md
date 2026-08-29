---
name: Coopérative feature configuration
description: Décisions durables pour l’activation des modules par coopérative.
---

La configuration d’une fonctionnalité est additive : lorsqu’aucune ligne n’existe pour une coopérative, le mode effectif est `active`, afin de préserver le comportement des coopératives existantes.

**Why:** La fonctionnalité a été introduite sans migration de données de configuration pour éviter de masquer ou de casser les modules déjà utilisés.

**How to apply:** Toute nouvelle fonctionnalité doit être ajoutée au catalogue global avec ses dépendances. La désactivation d’un parent doit désactiver en cascade ses dépendants; le contrôle doit rester ordonné licence → fonctionnalité → permission.

Les routeurs coopératifs montés avant le guard global (parce qu’ils partagent des routes terrain ou publiques) doivent appliquer explicitement la même chaîne de protection sur leurs préfixes sensibles.

**Why:** Un montage avant `authMiddleware` global contourne sinon silencieusement le contrôle de fonctionnalité, même si le préfixe existe dans le catalogue.

**How to apply:** Pour tout nouveau préfixe précoce, conserver l’ordre licence → RBAC → fonctionnalité et ne pas protéger les routes publiques ou M15 avec le guard coopératif.

Le mode `lecture_seule` est une capacité distincte du RBAC : l’interface doit résoudre la fonctionnalité du chemin courant avant d’appliquer les permissions d’écriture, tout en laissant les permissions de consultation et d’export intactes.

**Why:** Un simple masquage de module ou un contrôle RBAC ne prévient pas l’utilisateur lorsqu’un module reste visible mais que ses écritures sont bloquées par le guard serveur.

**How to apply:** Centraliser ce filtrage dans le hook de permission, prévoir un indicateur visuel dans le layout du module et protéger séparément les routes dédiées à la création.