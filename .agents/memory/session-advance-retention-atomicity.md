---
name: Atomicité retenue-livraison session
description: Règle de cohérence pour les retenues d'avance déclenchées par la clôture d'une session de pesée.
---

La retenue d'une avance sur une livraison de session, son écriture d'historique et l'insertion de la livraison officielle doivent être exécutées dans la même transaction PostgreSQL.

**Pourquoi:** une transaction séparée pour la retenue valide le débit avant la création de la livraison; une erreur de contrainte ou de données laisse alors un solde diminué sans pièce métier correspondante.

**Comment appliquer:** conserver le verrou advisory du membre et le verrou des avances jusqu'au commit de la transaction qui crée la livraison et lie les remboursements à celle-ci; faire remonter l'erreur d'insertion pour provoquer le rollback.