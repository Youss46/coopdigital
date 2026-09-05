---
name: Règlements groupés carburant
description: Règle d’atomicité et de traçabilité pour payer plusieurs bons carburant ensemble.
---

Un règlement groupé de bons carburant doit créer un seul mouvement de trésorerie pour le total, tout en conservant un paiement, une ligne de règlement et une écriture comptable par bon.

**Why:** Le paiement périodique est généralement effectué en une seule opération auprès de la station, mais les bons doivent rester retrouvables individuellement pour le contrôle, les statistiques et les justificatifs.

**How to apply:** Verrouiller tous les paiements sélectionnés dans une transaction, vérifier qu’ils sont encore `en_attente`, débiter une seule fois la source choisie, puis mettre à jour chaque paiement avec la même référence de lot. En cas d’échec ou de concurrence, annuler toute l’opération.