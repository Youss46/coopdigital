---
name: Payment integration fixture requirements
description: PostgreSQL payment fixtures must satisfy cooperative receipt and accounting fixture constraints.
---

Les fixtures d’intégration de paiements coopératifs doivent fournir `cooperative_id` et un `numero_recu` non nul, même lorsqu’elles simulent un paiement encore en attente. Les écritures de retenue d’avance peuvent rester dans `ecritures_en_attente` tant que `auto_avances` n’est pas activé.

**Why:** PostgreSQL applique une contrainte de reçu local sur les paiements coopératifs, et le routage comptable dépend de la configuration automatique de chaque module.

**How to apply:** Lorsqu’un test crée un paiement coopératif directement en SQL, renseigner ces champs et vérifier l’écriture dans la table correspondant à la configuration comptable de la fixture.