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

À la création d'une session, définir explicitement son statut à `en_cours`
plutôt que de dépendre uniquement de la valeur par défaut de la base.

**Why:** un environnement dont le schéma ou les valeurs par défaut ont dérivé
peut autrement créer une session immédiatement inutilisable.

**How to apply:** appliquer cette valeur à chaque chemin de création : bon de
réception, transfert, parcours standard et synchronisation hors ligne.

Le délai d'expiration configuré pour les sessions doit être une durée positive;
une valeur nulle ou invalide doit retomber sur le délai sûr par défaut.

**Why:** un délai à zéro annule une session ouverte dès le passage du cron, ce
qui laisse au peseur un bon affiché comme reprenable mais impossible à saisir.

**How to apply:** valider ce paramètre dans toute interface d'administration
et le normaliser côté service avant de calculer l'expiration.

Une session `controle_chargement` liée à une expédition doit être refusée par la
conversion en livraison depuis la session, à l'intérieur de la transaction qui
verrouille et relit la session.

**Why:** un garde uniquement placé avant la transaction est contournable par
une course concurrente et rend les tests isolés dépendants d'une lecture
supplémentaire non simulée.

**How to apply:** sélectionner `operation` et `expeditionId` dans la relecture
verrouillée, puis lever l'erreur avant tout effet métier de conversion.