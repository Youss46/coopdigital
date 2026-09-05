---
name: Idempotence de la validation des règlements
description: Une validation de paiement ne doit créer qu'une seule écriture comptable, même si la requête est répétée ou concurrente.
---

La transition d'un paiement vers son statut validé doit être conditionnée en base par `statut = en_attente`, et la ligne du paiement doit être verrouillée au début de la transaction, avant toute retenue d'avance ou autre effet secondaire. Une seconde requête doit être rejetée sans effet comptable. Si un helper de caisse est appelé ensuite, il doit relayer `skipAccounting` pour ne pas recréer l'écriture.

**Why:** une vérification de statut séparée de la mise à jour laisse passer deux requêtes concurrentes et peut générer deux écritures de règlement identiques. Pour une commission couverte par avance, verrouiller seulement la commission ou le membre est trop tardif : la seconde requête peut appliquer des effets d'avance avant de découvrir que le paiement est déjà traité. L'atomicité introduite dans le contrôleur pouvait aussi être doublée par l'écriture automatique du mouvement de caisse.

**How to apply:** pour tout nouveau parcours de validation, verrouiller le paiement avec `FOR UPDATE` au début de la transaction, puis utiliser une mise à jour conditionnelle avec retour de ligne; si le verrou révèle un statut différent de `en_attente`, répondre en conflit et ne lancer aucun effet secondaire.