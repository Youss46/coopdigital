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