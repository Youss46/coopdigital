---
name: Advance correction rejection history
description: Traceability rule when moving a rejected payment back to pending after reversing an advance retention.
---

Lorsqu’une correction d’avance remet un règlement rejeté en attente, le motif du rejet doit être copié dans la note de l’historique avant d’effacer le motif du règlement courant.

**Why:** le règlement courant doit redevenir actionnable, mais supprimer le motif sans le reporter dans l’historique détruit la traçabilité comptable du rejet précédent.

**How to apply:** lors de toute inversion automatique de retenue, verrouiller les paiements, bloquer les statuts confirmés/effectués, conserver les motifs rejetés dans l’historique, puis seulement remettre le paiement en attente.