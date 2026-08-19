---
name: Sessions de pesée
description: Règles métier durables du démarrage, de la traçabilité et du bordereau des sessions de pesée.
---

Toute nouvelle session de pesée doit recevoir, avant son démarrage, un type de
certification cacao parmi RA, FAIRTRADE, ASR_1000 ou ORDINAIRE. Cette donnée
reste liée à la session et figure sur son bordereau d'achat, y compris pour les
réceptions de bons de membres délégués et les transferts.

**Why:** la certification conditionne la traçabilité du stock et doit être
déclarée par le peseur au moment de la réception, pas déduite après coup.

**How to apply:** tout nouveau point d'entrée qui crée une session — en ligne,
hors ligne, depuis un transfert ou depuis un bon de réception — doit demander
la certification avant l'action et l'API doit refuser une valeur absente ou
inconnue.

Quand une clôture crée automatiquement une livraison, sa réponse doit inclure
l'identifiant de cette livraison. Après une conversion manuelle, l'écran doit
préserver le récapitulatif de la session validée plutôt que de recharger ou
d'afficher une session sans passages.

**Why:** la pesée validée est la référence du peseur ; un faux écran à zéro
incite à créer une seconde livraison ou laisse croire que les passages ont été
perdus.

**How to apply:** une session déjà liée à une livraison ne doit plus proposer
de conversion et les interfaces de conversion doivent garder une copie locale
du détail clôturé pendant l'appel réseau.

Une session de pesée annulée liée à un bon de réception doit libérer le lien
unique vers ce bon et remettre le bon en attente, dans la même transaction.

**Why:** le bon doit pouvoir être repesé après une annulation, mais la
contrainte d'unicité sur le lien session/bon bloque toute nouvelle session si
l'ancienne conserve ce lien.

**How to apply:** à l'annulation, dissocier la session tout en conservant son
historique; au démarrage et au chargement des réceptions, réparer aussi les
anciennes sessions annulées qui auraient gardé leur lien.