---
name: Producer card settlement
description: Internal producer-card payments are deferred until an explicit bank settlement.
---

La carte producteur identifie le membre au moment de la validation, mais le règlement reste en attente jusqu’à une action explicite de paiement depuis un compte bancaire local.

**Why:** La carte n’est ni un TPE ni une banque externe; le débit doit rester traçable, coopératif et idempotent.

**How to apply:** Conserver le numéro de carte en snapshot, verrouiller le règlement avant le débit, refuser les comptes inactifs/hors coopérative/insuffisants, et ne jamais débiter lors d’un rejet ou d’une annulation. Le mode carte reste un moyen unique, pas une ventilation mixte.