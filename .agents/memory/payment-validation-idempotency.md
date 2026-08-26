---
name: Idempotence de la validation des règlements
description: Une validation de paiement ne doit créer qu'une seule écriture comptable, même si la requête est répétée ou concurrente.
---

La transition d'un paiement vers son statut validé doit être conditionnée en base par `statut = en_attente`, puis l'écriture comptable doit être créée dans la même transaction. Une seconde requête doit être rejetée sans effet comptable. Si un helper de caisse est appelé ensuite, il doit relayer `skipAccounting` pour ne pas recréer l'écriture.

**Why:** une vérification de statut séparée de la mise à jour laisse passer deux requêtes concurrentes et peut générer deux écritures de règlement identiques; l'atomicité introduite dans le contrôleur pouvait aussi être doublée par l'écriture automatique du mouvement de caisse.

**How to apply:** pour tout nouveau parcours de validation, utiliser une mise à jour conditionnelle avec retour de ligne; si aucune ligne n'est retournée, répondre en conflit et ne lancer aucun effet secondaire.