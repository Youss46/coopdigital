---
name: Atomicité des réceptions d’expédition
description: Contraintes transactionnelles du parcours de réception au port
---

La confirmation de réception et la résolution d’un litige doivent verrouiller l’expédition puis exécuter dans un même client transactionnel la réparation des sorties de chargement, la mise à jour de réception, l’historique, les traitements de refus et les écritures OHADA, y compris la dette de transport 612/401.

Une requête qui acquiert ensuite le verrou sur une expédition déjà `receptionne` ou `litige` doit être un rejeu idempotent : elle peut réparer une sortie de chargement historique manquante, mais ne doit pas recréer l’historique, le traitement de refus ou les écritures comptables.

**Pourquoi:** une erreur de base ou d’écriture après la création d’une sortie peut sinon laisser une réception partiellement enregistrée, avec un stock et un statut incohérents.

**How to apply:** utiliser la variante transactionnelle de la réparation stock et `proposerEcrituresDansTransaction`; ne pas absorber les erreurs dans la transaction. Une source d’entrepôt manquante ou une écriture de frais transport impossible doit faire échouer l’opération plutôt que continuer silencieusement. Après lecture verrouillée d’un statut terminal, retourner sans rejouer les effets métier.