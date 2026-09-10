---
name: Advance correction rejection history
description: Traceability rule when moving a rejected payment back to pending after reversing an advance retention.
---

Lorsqu’une correction d’avance remet un règlement rejeté en attente, le motif du rejet doit être copié dans la note de l’historique avant d’effacer le motif du règlement courant.

**Why:** le règlement courant doit redevenir actionnable, mais supprimer le motif sans le reporter dans l’historique détruit la traçabilité comptable du rejet précédent.

**How to apply:** enregistrer un plan reporté doit inverser dans la même transaction les retenues tracées sur les livraisons antérieures à la date; verrouiller les paiements, bloquer les statuts confirmés/effectués, conserver les motifs rejetés dans l’historique, puis seulement remettre le paiement en attente.

Une avance peut déjà être au statut `rembourse` lorsque sa dernière retenue vient d’une livraison encore impayée : le report doit alors pouvoir restaurer cette retenue et rouvrir le solde. Seules les livraisons déjà réglées bloquent la correction automatique.

**Pourquoi:** le statut de l’avance décrit la déduction enregistrée, tandis que le paiement producteur est une étape distincte; les deux ne doivent pas empêcher une correction tant que l’argent n’a pas été versé.

**Comment appliquer:** ne pas refuser le report uniquement sur le statut `rembourse`; recalculer le statut depuis les retenues restaurées, tout en excluant les avances annulées/clôturées.

Une ligne d’historique de retenue mise à zéro avec la note `Déduction annulée —` est uniquement une trace, pas un remboursement actif; les contrôles d’annulation doivent parcourir toutes les lignes et ignorer seulement ces traces.

**Pourquoi:** conserver la ligne garantit l’audit du report, mais la compter encore bloque à tort l’annulation ultérieure de l’avance.

**Comment appliquer:** distinguer les retenues actives (`montantFcfa > 0`) des lignes annulées avant de décider si une avance peut être annulée.