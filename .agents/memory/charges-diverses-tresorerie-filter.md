---
name: Filtrage trésorerie des charges diverses
description: Le compte de trésorerie proposé doit rester compatible avec le mode de paiement.
---

Dans une charge diverse, le mode Espèces ne propose que les caisses; le virement ne propose que les banques et le Mobile Money uniquement les comptes marchands.

**Why:** La validation débite réellement le compte sélectionné; mélanger les types permettait d’enregistrer une combinaison incohérente entre mode, compte OHADA et source de trésorerie.

**How to apply:** Réinitialiser la sélection lorsqu’un changement de mode rend le compte courant incompatible, puis laisser l’utilisateur choisir la source précise à débiter.