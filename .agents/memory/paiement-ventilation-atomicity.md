---
name: Atomicité des règlements ventilés
description: Garanties à conserver lorsqu'un paiement utilise plusieurs moyens de règlement.
---

Un règlement ventilé doit valider le paiement, ses lignes, les chèques, les mouvements de trésorerie et toutes les écritures comptables dans une transaction commune. La somme des lignes est aussi contrôlée par une contrainte différée PostgreSQL.

Lors du rejet ou de l’annulation d’un chèque d’un règlement ventilé, ne pas remettre tout le paiement parent en attente : retirer seulement la ligne du chèque, conserver le montant et le statut des autres moyens, créer un règlement en attente pour la part retournée et extourner son écriture. La livraison retrouve uniquement cette part dans son solde restant. Lors d’une nouvelle validation d’un paiement mono-moyen revenu en attente, remplacer ses anciennes lignes dans la même transaction.

**Why:** Une ventilation espèces + chèque peut créer plusieurs effets financiers; une erreur ou une double validation ne doit laisser aucun sous-ensemble enregistré.

**How to apply:** Toute nouvelle ligne de règlement ou tout nouveau moyen doit passer par la transaction de validation et préserver l'égalité entre le montant parent et la somme des lignes. Au retour d’un chèque, garder la somme des lignes restantes égale au nouveau montant parent et regrouper la ligne d’attente, l’extourne et la restauration du solde dans la transaction.