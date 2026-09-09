---
name: Chèque d’avance à débit différé
description: Règles métier du paiement d’une avance producteur par chèque.
---

Un octroi d’avance par chèque crée immédiatement un chèque au statut `emis` et une écriture d’avance, mais ne crée aucun mouvement bancaire et ne diminue pas le solde du compte tiré avant l’encaissement réel. Le numéro du chèque est obligatoire dans ce parcours; la date d’échéance du chèque reste facultative.

**Why:** Un chèque émis représente un décaissement comptable engagé, tandis que le mouvement bancaire intervient seulement lorsque le chèque est encaissé.

**How to apply:** Réutiliser le registre des chèques émis et exiger un compte bancaire actif de la même coopérative; ne pas appeler la branche de débit bancaire pendant l’octroi par chèque.